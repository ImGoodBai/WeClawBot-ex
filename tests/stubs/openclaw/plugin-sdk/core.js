export function buildChannelConfigSchema(schema) {
  return schema;
}

export function normalizeAccountId(input) {
  return String(input ?? "")
    .trim()
    .replace(/[@.]/g, "-");
}

export function definePluginEntry(entry) {
  return entry;
}
