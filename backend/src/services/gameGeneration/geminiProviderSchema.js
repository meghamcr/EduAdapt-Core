'use strict';
// Provider transport accepts a JSON Schema subset. Keep the full contract in
// prompts and local validators; omit size constraints from the provider grammar
// to avoid combinatorial schema compilation. Local validation enforces every bound.
function providerSchema(schema) {
  const copy=structuredClone(schema);
  function visit(rule) {
    if(rule.type==='string') { delete rule.minLength; delete rule.maxLength; delete rule.pattern; }
    if(rule.type==='array') { delete rule.minItems; delete rule.maxItems; }
    Object.values(rule.properties || {}).forEach(visit);
    if(rule.items)visit(rule.items);
    rule.anyOf?.forEach(visit);
  }
  visit(copy); return copy;
}
module.exports={providerSchema};
