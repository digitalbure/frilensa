#!/usr/bin/env python3
"""Turn `gcloud run services describe --format=json` output into a spec for `gcloud run services replace`.

Keeps every existing setting (env vars, secrets, scaling, service account, domains) and only:
  - points the main container at the newly built image,
  - removes annotations left by AI Studio's source deploys (they make gcloud reject a plain image),
  - removes read-only fields that `replace` doesn't accept,
  - adds env vars passed as NAME=VALUE arguments when they aren't already set.

Usage: prepare_service.py SERVICE.json IMAGE OUT.json [NAME=VALUE ...]
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

    containers = template["spec"]["containers"]
    main_container = containers[0]
    main_container["image"] = image
    main_container.pop("baseImageUri", None)
    env = main_container.setdefault("env", [])
    existing = {e.get("name") for e in env}
    for pair in env_pairs:
        name, _, value = pair.partition("=")
        if name and name not in existing:
            env.append({"name": name, "value": value})
            print(f"Adding env var {name}.")

    with open(out, "w") as f:
        json.dump(svc, f, indent=2)


if __name__ == "__main__":
    main()
