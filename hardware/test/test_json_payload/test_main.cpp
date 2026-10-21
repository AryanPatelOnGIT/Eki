#include <unity.h>
#include <cstdlib>
#include "json_payload.h"

void setUp() {}
void tearDown() {}

struct FailingAllocator : ArduinoJson::Allocator {
  void *allocate(size_t) override { return nullptr; }
  void deallocate(void *) override {}
  void *reallocate(void *, size_t) override { return nullptr; }
};

void test_exhausted_allocator_never_serializes_partial_schema() {
  FailingAllocator allocator;
  JsonDocument document(&allocator);
  document["lat"] = 23.0;
  document["lng"] = 72.0;
  char payload[512] = "unsent";
  TEST_ASSERT_TRUE(document.overflowed());
  TEST_ASSERT_EQUAL_UINT32(0, eki::json::serializeCompletePayload(document, 2, payload, sizeof(payload)));
  TEST_ASSERT_EQUAL_STRING("unsent", payload);
}

void test_missing_fields_and_small_buffers_are_rejected_before_serialization() {
  JsonDocument document;
  document["lat"] = 23.0;
  char payload[128] = "unsent";
  TEST_ASSERT_EQUAL_UINT32(0, eki::json::serializeCompletePayload(document, 2, payload, sizeof(payload)));
  TEST_ASSERT_EQUAL_STRING("unsent", payload);
  document["lng"] = 72.0;
  TEST_ASSERT_EQUAL_UINT32(0, eki::json::serializeCompletePayload(document, 2, payload, 5));
  TEST_ASSERT_EQUAL_STRING("unsent", payload);
  const size_t length = eki::json::serializeCompletePayload(document, 2, payload, sizeof(payload));
  TEST_ASSERT_EQUAL_UINT32(measureJson(document), length);
  JsonDocument parsed;
  TEST_ASSERT_FALSE(deserializeJson(parsed, payload));
  TEST_ASSERT_EQUAL_UINT32(2, parsed.size());
}

int main(int, char **) {
  UNITY_BEGIN();
  RUN_TEST(test_exhausted_allocator_never_serializes_partial_schema);
  RUN_TEST(test_missing_fields_and_small_buffers_are_rejected_before_serialization);
  return UNITY_END();
}
