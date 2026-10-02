#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <type_traits>

namespace eki { namespace checkpoint {
constexpr size_t RECORD_BYTES = 128;
struct Record { uint8_t bytes[RECORD_BYTES]; };

/** Append-only authenticated records. Never erase the latest committed page. */
template <typename Sample, typename Storage, typename Codec>
class Journal {
 public:
  static_assert(std::is_trivially_copyable<Sample>::value, "Checkpoint samples must be values");
  static_assert(Storage::PAGE_BYTES >= RECORD_BYTES && Storage::PAGE_BYTES % RECORD_BYTES == 0, "Checkpoint pages must contain whole records");
  Journal(Storage &storage, Codec &codec) : storage_(storage), codec_(codec) {}
  bool initialize() {
    const size_t count = storage_.recordCount();
    ready_ = count >= 2 * recordsPerPage() && count % recordsPerPage() == 0;
    found_ = false; generation_ = 0; writeIndex_ = 0; latestIndex_ = SIZE_MAX;
    if (!ready_) return false;
    for (size_t index = 0; index < count; ++index) {
      Record record{}; Sample sample{}; uint32_t generation = 0;
      if (!storage_.read(index, record)) { ready_ = false; found_ = false; return false; }
      if (!codec_.open(record, generation, sample)) continue;
      if (!found_ || static_cast<int32_t>(generation - generation_) > 0) {
        found_ = true; generation_ = generation; latest_ = sample; latestIndex_ = index;
      }
    }
    if (found_) writeIndex_ = (latestIndex_ + 1) % count;
    return found_;
  }
  bool ready() const { return ready_; }
  bool newest(Sample &sample) const { if (!found_) return false; sample = latest_; return true; }
  bool append(const Sample &sample) {
    if (!ready_) return false;
    const size_t count = storage_.recordCount();
    const size_t index = writeIndex_;
    uint32_t nextGeneration = generation_ + 1;
    if (nextGeneration == 0) ++nextGeneration;
    Record record{};
    // A codec/entropy failure must not erase a page or consume flash wear.
    if (!codec_.seal(nextGeneration, sample, record)) return false;
    if (index % recordsPerPage() == 0) {
      // Failed/torn writes can consume an entire ring without committing a
      // successor. Keep the last confirmed page until another page commits.
      if (found_ && index / recordsPerPage() == latestIndex_ / recordsPerPage()) {
        writeIndex_ = (index + recordsPerPage()) % count; return false;
      }
      if (!storage_.erasePage(index / recordsPerPage())) {
        writeIndex_ = (index + recordsPerPage()) % count; return false;
      }
    }
    generation_ = nextGeneration;
    // A failure can have written every byte. Allocate a new generation/slot
    // on retry so an outcome-unknown write cannot alias its successor.
    writeIndex_ = (index + 1) % count;
    if (!storage_.write(index, record)) return false;
    latest_ = sample; latestIndex_ = index; found_ = true;
    return true;
  }
 private:
  static constexpr size_t recordsPerPage() { return Storage::PAGE_BYTES / RECORD_BYTES; }
  Storage &storage_; Codec &codec_;
  Sample latest_{};
  uint32_t generation_ = 0;
  size_t writeIndex_ = 0;
  size_t latestIndex_ = SIZE_MAX;
  bool ready_ = false, found_ = false;
};
} }
