#include <unity.h>
#include "checkpoint_journal.h"
#include "telemetry_queue.h"
#include <algorithm>
#include <vector>
#include <cstring>

using eki::checkpoint::Record;
struct Fix { int64_t timestamp; uint32_t sequence; double latitude; };
struct Flash {
  static constexpr size_t PAGE_BYTES = 256;
  std::vector<uint8_t> bytes = std::vector<uint8_t>(PAGE_BYTES * 3, 0xFF);
  int tearAfter = -1;
  bool eraseFailure = false, readFailure = false;
  size_t erases = 0;
  size_t recordCount() const { return bytes.size() / eki::checkpoint::RECORD_BYTES; }
  bool read(size_t index, Record &record) {
    if (readFailure) return false;
    std::memcpy(record.bytes, bytes.data() + index * sizeof(record), sizeof(record)); return true;
  }
  bool write(size_t index, const Record &record) {
    const size_t count = tearAfter < 0 ? sizeof(record) : static_cast<size_t>(tearAfter);
    for (size_t i = 0; i < count; ++i) {
      auto &destination = bytes[index * sizeof(record) + i];
      if ((destination & record.bytes[i]) != record.bytes[i]) return false;
      destination &= record.bytes[i];
    }
    return tearAfter < 0;
  }
  bool erasePage(size_t page) {
    ++erases;
    // Model a power cut partway through erasing an old page.
    const size_t count = eraseFailure ? PAGE_BYTES / 2 : PAGE_BYTES;
    std::fill(bytes.begin() + page * PAGE_BYTES, bytes.begin() + page * PAGE_BYTES + count, 0xFF);
    return !eraseFailure;
  }
};
// Native fault injection uses a deterministic authenticity stand-in. Fleet
// code uses mbedTLS AES-256-GCM; this tests journal/storage state, not AES.
struct Codec {
  uint32_t tag;
  bool sealFailure = false;
  explicit Codec(uint32_t value = 7) : tag(value) {}
  uint32_t checksum(const Record &record) {
    uint32_t hash = 2166136261UL;
    for (size_t i = 0; i < 124; ++i) { hash ^= record.bytes[i]; hash *= 16777619UL; }
    return hash;
  }
  bool seal(uint32_t generation, const Fix &sample, Record &record) {
    if (sealFailure) return false;
    std::memset(record.bytes, 0xAA, sizeof(record.bytes));
    const uint32_t header[] = {0x454B4901, tag, generation, sizeof(Fix)};
    std::memcpy(record.bytes, header, sizeof(header));
    std::memcpy(record.bytes + 16, &sample, sizeof(sample));
    const uint32_t hash = checksum(record);
    for (size_t i = 0; i < 4; ++i) record.bytes[124 + i] = (hash >> (i * 8)) & 0x7F;
    return true;
  }
  bool open(const Record &record, uint32_t &generation, Fix &sample) {
    uint32_t header[4]{}; std::memcpy(header, record.bytes, sizeof(header));
    if (header[0] != 0x454B4901 || header[1] != tag || header[2] == 0 || header[3] != sizeof(Fix)) return false;
    const uint32_t hash = checksum(record);
    for (size_t i = 0; i < 4; ++i) if (record.bytes[124 + i] != ((hash >> (i * 8)) & 0x7F)) return false;
    generation = header[2]; std::memcpy(&sample, record.bytes + 16, sizeof(sample)); return true;
  }
};
using Journal = eki::checkpoint::Journal<Fix, Flash, Codec>;
void setUp() {}
void tearDown() {}
Fix fix(uint32_t sequence) { return {1790000000000LL + sequence * 1000, sequence, 23.0 + sequence / 100000.0}; }

void test_cold_boot_recovers_committed_fix_and_original_retry_sequence() {
  Flash flash; Codec codec; Journal before(flash, codec); before.initialize();
  TEST_ASSERT_TRUE(before.append(fix(37)));
  eki::telemetry::NewestFirstTelemetryQueue<Fix, 4> rtc{}; rtc.reset(7); rtc.push(fix(37));
  // Complete loss of volatile and RTC state; only flash survives.
  std::memset(&rtc, 0, sizeof(rtc));
  TEST_ASSERT_FALSE(rtc.initializeOrRecover(7));
  Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize());
  Fix restored{}; TEST_ASSERT_TRUE(after.newest(restored));
  TEST_ASSERT_TRUE(rtc.restoreNewest(restored, 7));
  TEST_ASSERT_TRUE(rtc.newest(restored)); TEST_ASSERT_EQUAL_UINT32(37, restored.sequence);
  TEST_ASSERT_EQUAL_UINT32(38, rtc.push(fix(38)));
}
void test_every_torn_record_offset_retains_last_authenticated_checkpoint() {
  for (int cut = 0; cut <= 128; ++cut) {
    Flash flash; Codec codec; Journal before(flash, codec); before.initialize(); before.append(fix(1));
    flash.tearAfter = cut; TEST_ASSERT_FALSE(before.append(fix(2)));
    Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize());
    Fix restored{}; after.newest(restored); TEST_ASSERT_EQUAL_UINT32(cut == 128 ? 2 : 1, restored.sequence);
  }
}
void test_recovered_checkpoint_still_obeys_freshness_and_warm_rtc_is_authoritative() {
  Flash flash; Codec codec; Journal before(flash, codec); before.initialize(); before.append(fix(37));
  Journal cold(flash, codec); TEST_ASSERT_TRUE(cold.initialize()); Fix restored{}; cold.newest(restored);
  eki::telemetry::NewestFirstTelemetryQueue<Fix, 4> rtc{}; rtc.restoreNewest(restored, 7);
  TEST_ASSERT_EQUAL_UINT32(0, rtc.dropOlderThan(restored.timestamp - 55000));
  TEST_ASSERT_EQUAL_UINT32(1, rtc.dropOlderThan(restored.timestamp + 1));
  // An acknowledged empty warm queue is valid: do not resurrect flash on a reset.
  TEST_ASSERT_TRUE(rtc.initializeOrRecover(7)); TEST_ASSERT_FALSE(rtc.newest(restored));
}
void test_wraparound_and_interrupted_old_page_erase_preserve_latest_checkpoint() {
  Flash flash; Codec codec; Journal journal(flash, codec); journal.initialize();
  for (uint32_t i = 1; i <= 6; ++i) TEST_ASSERT_TRUE(journal.append(fix(i)));
  flash.eraseFailure = true; TEST_ASSERT_FALSE(journal.append(fix(7)));
  Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize());
  Fix restored{}; after.newest(restored); TEST_ASSERT_EQUAL_UINT32(6, restored.sequence);
  flash.eraseFailure = false; TEST_ASSERT_TRUE(after.append(fix(8)));
  Journal finalBoot(flash, codec); TEST_ASSERT_TRUE(finalBoot.initialize()); finalBoot.newest(restored);
  TEST_ASSERT_EQUAL_UINT32(8, restored.sequence);
}
void test_corrupt_record_and_wrong_identity_are_rejected() {
  Flash flash; Codec codec; Journal before(flash, codec); before.initialize(); before.append(fix(1)); before.append(fix(2));
  flash.bytes[128 + 50] ^= 1;
  Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize()); Fix restored{}; after.newest(restored);
  TEST_ASSERT_EQUAL_UINT32(1, restored.sequence);
  Codec changed(8); Journal otherDevice(flash, changed); TEST_ASSERT_FALSE(otherDevice.initialize());
  TEST_ASSERT_FALSE(otherDevice.newest(restored));
}
void test_unknown_write_outcome_cannot_alias_successor_generation() {
  Flash flash; Codec codec; Journal before(flash, codec); before.initialize(); before.append(fix(1));
  flash.tearAfter = 128; TEST_ASSERT_FALSE(before.append(fix(2)));
  flash.tearAfter = -1; TEST_ASSERT_TRUE(before.append(fix(3)));
  Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize()); Fix restored{}; after.newest(restored);
  TEST_ASSERT_EQUAL_UINT32(3, restored.sequence);
}
void test_generation_wrap_is_ordered_and_zero_is_skipped() {
  Flash flash; Codec codec; Record record{}; codec.seal(UINT32_MAX, fix(1), record); flash.write(0, record);
  Journal journal(flash, codec); TEST_ASSERT_TRUE(journal.initialize()); TEST_ASSERT_TRUE(journal.append(fix(2)));
  Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize()); Fix restored{}; after.newest(restored);
  TEST_ASSERT_EQUAL_UINT32(2, restored.sequence);
}
void test_read_failure_disables_writes_instead_of_erasing_unknown_committed_data() {
  Flash flash; Codec codec; Journal before(flash, codec); before.initialize(); before.append(fix(1));
  const auto preserved = flash.bytes; flash.readFailure = true;
  Journal after(flash, codec); TEST_ASSERT_FALSE(after.initialize()); TEST_ASSERT_FALSE(after.ready());
  TEST_ASSERT_FALSE(after.append(fix(2))); TEST_ASSERT_TRUE(flash.bytes == preserved);
}
void test_failed_writes_never_erase_only_committed_page() {
  Flash flash; Codec codec; Journal journal(flash, codec); journal.initialize(); journal.append(fix(1));
  flash.tearAfter = 0;
  for (uint32_t i = 2; i <= 20; ++i) TEST_ASSERT_FALSE(journal.append(fix(i)));
  Journal after(flash, codec); TEST_ASSERT_TRUE(after.initialize()); Fix restored{}; after.newest(restored);
  TEST_ASSERT_EQUAL_UINT32(1, restored.sequence);
}
void test_codec_failure_never_erases_flash() {
  Flash flash; Codec codec; Journal journal(flash, codec); journal.initialize();
  const auto empty = flash.bytes; codec.sealFailure = true;
  TEST_ASSERT_FALSE(journal.append(fix(1))); TEST_ASSERT_EQUAL_UINT32(0, flash.erases);
  TEST_ASSERT_TRUE(flash.bytes == empty);
  codec.sealFailure = false; TEST_ASSERT_TRUE(journal.append(fix(1)));
}
int main(int, char **) {
  UNITY_BEGIN();
  RUN_TEST(test_cold_boot_recovers_committed_fix_and_original_retry_sequence);
  RUN_TEST(test_every_torn_record_offset_retains_last_authenticated_checkpoint);
  RUN_TEST(test_recovered_checkpoint_still_obeys_freshness_and_warm_rtc_is_authoritative);
  RUN_TEST(test_wraparound_and_interrupted_old_page_erase_preserve_latest_checkpoint);
  RUN_TEST(test_corrupt_record_and_wrong_identity_are_rejected);
  RUN_TEST(test_unknown_write_outcome_cannot_alias_successor_generation);
  RUN_TEST(test_generation_wrap_is_ordered_and_zero_is_skipped);
  RUN_TEST(test_read_failure_disables_writes_instead_of_erasing_unknown_committed_data);
  RUN_TEST(test_failed_writes_never_erase_only_committed_page);
  RUN_TEST(test_codec_failure_never_erases_flash);
  return UNITY_END();
}
