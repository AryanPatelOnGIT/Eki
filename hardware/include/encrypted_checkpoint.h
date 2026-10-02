#pragma once
#include "checkpoint_journal.h"
#include <esp_partition.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include <cstring>

namespace eki { namespace checkpoint {
class FlashStorage {
 public:
  static constexpr size_t PAGE_BYTES = 4096;
  bool begin() {
    partition_ = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "gps_log");
#if !defined(CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH) && !defined(CONFIG_ESP32_ENABLE_COREDUMP_TO_FLASH)
    // Older layouts reserve this region but never enable a flash crash dump.
    // Keep OTA app addresses unchanged; refuse this fallback if dumps are on.
    if (!partition_) partition_ = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, "coredump");
#endif
    return partition_ && partition_->size >= 2 * PAGE_BYTES && partition_->size % PAGE_BYTES == 0;
  }
  size_t recordCount() const { return partition_ ? partition_->size / RECORD_BYTES : 0; }
  bool read(size_t index, Record &record) { return esp_partition_read(partition_, index * RECORD_BYTES, record.bytes, RECORD_BYTES) == ESP_OK; }
  bool write(size_t index, const Record &record) { return esp_partition_write(partition_, index * RECORD_BYTES, record.bytes, RECORD_BYTES) == ESP_OK; }
  bool erasePage(size_t page) { return esp_partition_erase_range(partition_, page * PAGE_BYTES, PAGE_BYTES) == ESP_OK; }
 private:
  const esp_partition_t *partition_ = nullptr;
};

/** The storage adapter sees ciphertext only, including on development boards. */
template <typename Sample>
class EncryptedCodec {
 public:
  static_assert(sizeof(Sample) <= 80, "Checkpoint sample exceeds encrypted record");
  EncryptedCodec() { mbedtls_gcm_init(&context_); }
  ~EncryptedCodec() { mbedtls_gcm_free(&context_); }
  bool begin(const char *secret, uint32_t configurationTag) {
    configurationTag_ = configurationTag;
    static const char domain[] = "Eki GPS checkpoint key v1";
    uint8_t key[32]{};
    const auto *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!info || mbedtls_md_hmac(info, reinterpret_cast<const uint8_t *>(secret), std::strlen(secret), reinterpret_cast<const uint8_t *>(domain), sizeof(domain) - 1, key) != 0) return false;
    const int result = mbedtls_gcm_setkey(&context_, MBEDTLS_CIPHER_ID_AES, key, 256);
    std::memset(key, 0, sizeof(key)); ready_ = result == 0;
    return ready_;
  }
  bool seal(uint32_t generation, const Sample &sample, Record &record) {
    if (!ready_) return false;
    // esp_fill_random requires an enabled radio entropy source. Credential
    // isolation disables Wi-Fi; keep RTC buffering instead of sealing then.
    wifi_mode_t radioMode = WIFI_MODE_NULL;
    if (esp_wifi_get_mode(&radioMode) != ESP_OK || radioMode == WIFI_MODE_NULL) return false;
    uint8_t plain[80]{};
    std::memcpy(plain, &sample, sizeof(sample));
    const uint32_t header[] = {MAGIC, configurationTag_, generation, static_cast<uint32_t>(sizeof(Sample))};
    std::memset(record.bytes, 0, RECORD_BYTES);
    std::memcpy(record.bytes, header, sizeof(header));
    esp_fill_random(record.bytes + 16, 12);
    const int result = mbedtls_gcm_crypt_and_tag(&context_, MBEDTLS_GCM_ENCRYPT, sizeof(plain), record.bytes + 16, 12, record.bytes, 32, plain, record.bytes + 32, 16, record.bytes + 112);
    std::memset(plain, 0, sizeof(plain));
    return result == 0;
  }
  bool open(const Record &record, uint32_t &generation, Sample &sample) {
    if (!ready_) return false;
    uint32_t header[4]{}; std::memcpy(header, record.bytes, sizeof(header));
    if (header[0] != MAGIC || header[1] != configurationTag_ || header[2] == 0 || header[3] != sizeof(Sample)) return false;
    uint8_t plain[80]{};
    const int result = mbedtls_gcm_auth_decrypt(&context_, sizeof(plain), record.bytes + 16, 12, record.bytes, 32, record.bytes + 112, 16, record.bytes + 32, plain);
    if (result == 0) { generation = header[2]; std::memcpy(&sample, plain, sizeof(sample)); }
    std::memset(plain, 0, sizeof(plain));
    return result == 0;
  }
 private:
  static constexpr uint32_t MAGIC = 0x454B4A01;
  mbedtls_gcm_context context_;
  uint32_t configurationTag_ = 0;
  bool ready_ = false;
};
} }
