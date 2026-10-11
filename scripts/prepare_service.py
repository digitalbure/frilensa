#!/usr/bin/env python3
"""Turn `gcloud run services describe --format=json` output into a spec for `gcloud run services replace`.

Keeps every existing setting (env vars, secrets, scaling, service account, domains) and only:
  - points the main container at the newly built image,
  - removes annotations and the base-image runtime left by AI Studio's source deploys
    (they make gcloud reject a plain image),
  - removes read-only fields that `replace` doesn't accept,
  - adds env vars passed as NAME=VALUE arguments when they aren't already set,
    sets NAME:=VALUE ones whatever their current value,
    and points NAME@=SECRET ones at the latest version of a Secret Manager secret.

Usage: prepare_service.py SERVICE.json IMAGE OUT.json [NAME=VALUE | NAME:=VALUE | NAME@=SECRET ...]
"""
import json
import sys

READ_ONLY_METADATA = {"uid", "resourceVersion", "generation", "creationTimestamp", "selfLink"}
READ_ONLY_ANNOTATIONS = {
    "serving.knative.dev/creator",
    "serving.knative.dev/lastModifier",
    "run.googleapis.com/operation-id",
    "run.googleapis.com/ingress-status",
    "run.googleapis.com/urls",
}


def is_source_annotation(key: str) -> bool:
    return (key.startswith("run.googleapis.com/source")
            or key.startswith("run.googleapis.com/build")
            or key == "run.googleapis.com/base-images")


def clean_annotations(annotations: dict) -> dict:
    return {k: v for k, v in (annotations or {}).items()
            if k not in READ_ONLY_ANNOTATIONS and not is_source_annotation(k)}


def main() -> None:
    src, image, out, *env_pairs = sys.argv[1:]
    with open(src) as f:
        svc = json.load(f)

    svc.pop("status", None)
    meta = svc.setdefault("metadata", {})
    for key in READ_ONLY_METADATA:
        meta.pop(key, None)
    meta["annotations"] = clean_annotations(meta.get("annotations"))

    template = svc["spec"]["template"]
    tmeta = template.setdefault("metadata", {})
    tmeta.pop("name", None)  # let Cloud Run name the new revision
    tmeta["annotations"] = clean_annotations(tmeta.get("annotations"))

    # AI Studio turns on automatic base-image updates, which only works for source deploys
    # (it requires the base-images annotation removed above).
    if template["spec"].get("runtimeClassName") == "run.googleapis.com/linux-base-image-update":
        template["spec"].pop("runtimeClassName")

    containers = template["spec"]["containers"]
    main_container = containers[0]
    main_container["image"] = image
    main_container.pop("baseImageUri", None)
    env = main_container.setdefault("env", [])
    existing = {e.get("name") for e in env}
    for pair in env_pairs:
        if "@=" in pair and pair.find("@=") < pair.find("=") + 1:
            name, _, secret = pair.partition("@=")
            ref = {"secretKeyRef": {"name": secret, "key": "latest"}}
            current = next((e for e in env if e.get("name") == name), None)
            if current is None:
                env.append({"name": name, "valueFrom": ref})
                print(f"Adding env var {name} from secret {secret}.")
            elif current.get("valueFrom") != ref:
                print(f"Setting env var {name} to secret {secret}.")
                current.pop("value", None)
                current["valueFrom"] = ref
            continue
        # NAME=VALUE adds the variable only if it's missing; NAME:=VALUE always sets it.
        force = pair.find(":=") != -1 and pair.find(":=") == pair.find("=") - 1
        name, _, value = pair.partition(":=" if force else "=")
        if not name:
            continue
        if force:
            current = next((e for e in env if e.get("name") == name), None)
            if current is None:
                env.append({"name": name, "value": value})
                print(f"Adding env var {name}.")
            elif current.get("value") != value or "valueFrom" in current:
                print(f"Setting env var {name} to {value} (was {current.get('value', 'a secret reference')}).")
                current.pop("valueFrom", None)
                current["value"] = value
        elif name not in existing:
            env.append({"name": name, "value": value})
            print(f"Adding env var {name}.")

    with open(out, "w") as f:
        json.dump(svc, f, indent=2)


if __name__ == "__main__":
    main()
