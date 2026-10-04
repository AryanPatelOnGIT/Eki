#pragma once
#include "dns_resolution_policy.h"
#include <Arduino.h>
#include <WiFi.h>
#include <atomic>
#include <lwip/dns.h>
#include <lwip/tcpip.h>

namespace eki { namespace dns {
/** DNS executes only on lwIP's TCP/IP thread; no TLS client crosses tasks. */
class BoundedResolver {
  ResolutionState state_;
  portMUX_TYPE mux_ = portMUX_INITIALIZER_UNLOCKED;
  std::atomic<uint32_t> networkEpoch_{1};

  void finish(uint32_t ticket, const ip_addr_t *address) {
    const uint32_t value = address && IP_IS_V4(address) ? ip4_addr_get_u32(ip_2_ip4(address)) : 0;
    portENTER_CRITICAL(&mux_);
    state_.complete(ticket, networkEpoch_.load(), value, millis());
    portEXIT_CRITICAL(&mux_);
  }
  static void found(const char *, const ip_addr_t *address, void *argument) {
    auto *self = static_cast<BoundedResolver *>(argument);
    // No later job can reuse this owner slot until this callback settles it.
    self->finish(self->state_.ticket(), address);
  }
  static void dispatch(void *argument) {
    auto *self = static_cast<BoundedResolver *>(argument);
    ip_addr_t address{};
    const uint32_t ticket = self->state_.ticket();
    const err_t result = dns_gethostbyname_addrtype(self->state_.host(), &address, found, self, LWIP_DNS_ADDRTYPE_IPV4);
    if (result == ERR_OK) self->finish(ticket, &address);
    else if (result != ERR_INPROGRESS) self->finish(ticket, nullptr);
  }
public:
  void networkChanged() { networkEpoch_.fetch_add(1); }
  bool resolve(const char *host, IPAddress &address) {
    if (WiFi.status() != WL_CONNECTED) return false;
    const uint32_t epoch = networkEpoch_.load();
    portENTER_CRITICAL(&mux_);
    const Request request = state_.begin(host, epoch, millis());
    portEXIT_CRITICAL(&mux_);
    if (request.admission == Admission::Rejected) return false;
    if (request.admission == Admission::Started && tcpip_try_callback(dispatch, this) != ERR_OK) finish(request.ticket, nullptr);
    for (;;) {
      uint32_t resolved = 0;
      portENTER_CRITICAL(&mux_);
      const Result result = state_.poll(request.ticket, networkEpoch_.load(), millis(), resolved);
      portEXIT_CRITICAL(&mux_);
      if (result == Result::Resolved) { address = resolved; return true; }
      if (result != Result::Pending || WiFi.status() != WL_CONNECTED) return false;
      delay(1);
    }
  }
};
} }
