#pragma once
#include <ArduinoJson.h>
#include <cstddef>

namespace eki {
namespace json {
// Allocation failure can leave a syntactically valid partial object.
// Validate completeness before touching the send buffer.
inline size_t serializeCompletePayload(const JsonDocument &document, size_t requiredFields,
                                      char *buffer, size_t capacity) {
  if (document.overflowed() || document.size() != requiredFields || !buffer || !capacity) return 0;
  const size_t expected = measureJson(document);
  if (!expected || expected >= capacity) return 0;
  const size_t actual = serializeJson(document, buffer, capacity);
  return actual == expected ? actual : 0;
}
}
}
