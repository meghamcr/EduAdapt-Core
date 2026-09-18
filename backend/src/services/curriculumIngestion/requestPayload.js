// Pure local accounting of an already constructed JSON request. No transport,
// credential access, source logging or payload persistence. Components are
// disjoint UTF-8 serialized bytes; JSON punctuation lives in envelopeBytes.
function measureRequestPayload(request) {
  const bytes = value => Buffer.byteLength(value, "utf8");
  const stringBytes = value => bytes(JSON.stringify(value)) - 2;
  const parts = request.contents.flatMap(content => content.parts);
  const pdfs = parts.filter(part => part.inlineData?.mimeType === "application/pdf");
  const textParts = parts.filter(part => typeof part.text === "string");
  const totalBytes = bytes(JSON.stringify(request));
  const pdfBase64Bytes = pdfs.reduce((sum, part) => sum + stringBytes(part.inlineData.data), 0);
  const promptTextBytes = textParts.length ? stringBytes(textParts[0].text) : 0;
  const attachmentMetadataBytes = textParts.slice(1).reduce((sum, part) => sum + stringBytes(part.text), 0);
  const schemaBytes = request.generationConfig?.responseJsonSchema ? bytes(JSON.stringify(request.generationConfig.responseJsonSchema)) : 0;
  return { totalBytes, pdfAttachments: pdfs.length, pdfBase64Bytes, promptTextBytes,
    attachmentMetadataBytes, schemaBytes,
    envelopeBytes: totalBytes - pdfBase64Bytes - promptTextBytes - attachmentMetadataBytes - schemaBytes };
}
module.exports = { measureRequestPayload };
