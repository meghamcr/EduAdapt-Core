// Retired entry point: file-only import bypassed approval and deleted chapter nodes.
// Keep the exports for callers, but never construct a client or perform writes here.
function sortNodesParentFirst(nodes) {
  const remaining = [...nodes], result = [], seen = new Set();
  while (remaining.length) {
    const ready = remaining.filter(n => !n.parent_id || seen.has(n.parent_id)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    if (!ready.length) throw new Error('Unable to resolve curriculum node parents.');
    for (const node of ready) {
      if (seen.has(node.id)) throw new Error('Duplicate curriculum node ID.');
      seen.add(node.id); result.push(node); remaining.splice(remaining.indexOf(node), 1);
    }
  }
  return result;
}
async function importCurriculumFile() {
  const error = new Error('File-only import is disabled. Use artifactCli.js to persist, review, dry-run and explicitly import an approved version.');
  error.code = 'LEGACY_IMPORT_DISABLED';
  throw error;
}
if (require.main === module) importCurriculumFile().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { importCurriculumFile, sortNodesParentFirst };
