export interface Release {
  version: string;
  date: string;
  sections: { heading: string; items: string[] }[];
}

// Parses the Keep a Changelog format used by CHANGELOG.md (the single source of release notes).
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;
  for (const line of markdown.split('\n')) {
    const release = line.match(/^## \[(.+?)\](?:\s*-\s*(.+))?/);
    if (release) {
      if (release[1].toLowerCase() === 'unreleased') { current = null; continue; }
      current = { version: release[1], date: (release[2] || '').trim(), sections: [] };
      releases.push(current);
      continue;
    }
    if (!current) continue;
    const heading = line.match(/^### (.+)/);
    if (heading) { current.sections.push({ heading: heading[1].trim(), items: [] }); continue; }
    const item = line.match(/^- (.+)/);
    if (item) {
      if (!current.sections.length) current.sections.push({ heading: 'Changes', items: [] });
      current.sections[current.sections.length - 1].items.push(item[1].replace(/\*\*|`/g, ''));
    }
  }
  return releases;
}
