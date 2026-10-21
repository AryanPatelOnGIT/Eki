#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>

namespace eki { namespace dns {
constexpr uint32_t RESPONSE_BUDGET_MS = 1000;
constexpr size_t HOST_CAPACITY = 254;
enum class Admission { Started, Waiting, Rejected };
enum class Result { Pending, Resolved, Failed, Expired };
struct Request { Admission admission; uint32_t ticket; };

/** One DNS owner slot; a caller deadline never releases underlying work. */
class ResolutionState {
  bool active_ = false;
  uint32_t sequence_ = 0, ticket_ = 0, epoch_ = 0, startedAt_ = 0;
  uint32_t finishedTicket_ = 0, finishedEpoch_ = 0, finishedStart_ = 0, address_ = 0;
  char host_[HOST_CAPACITY]{};
public:
  Request begin(const char *host, uint32_t epoch, uint32_t now) {
    if (host == nullptr || host[0] == '\0') return {Admission::Rejected, 0};
    size_t length = 0;
    while (length < HOST_CAPACITY && host[length]) ++length;
    if (length == HOST_CAPACITY) return {Admission::Rejected, 0};
    if (active_) return epoch == epoch_ && std::strcmp(host, host_) == 0
      ? Request{Admission::Waiting, ticket_} : Request{Admission::Rejected, 0};
    if (++sequence_ == 0) ++sequence_;
    ticket_ = sequence_; epoch_ = epoch; startedAt_ = now;
    std::memcpy(host_, host, length + 1);
    active_ = true;
    return {Admission::Started, ticket_};
  }
  bool complete(uint32_t ticket, uint32_t currentEpoch, uint32_t address, uint32_t now) {
    if (!active_ || ticket != ticket_) return false;
    finishedTicket_ = ticket_; finishedEpoch_ = epoch_; finishedStart_ = startedAt_;
    address_ = currentEpoch == epoch_ && static_cast<uint32_t>(now - startedAt_) < RESPONSE_BUDGET_MS ? address : 0;
    active_ = false;
    return true;
  }
  Result poll(uint32_t ticket, uint32_t epoch, uint32_t now, uint32_t &address) const {
    address = 0;
    if (active_ && ticket == ticket_) {
      if (epoch != epoch_) return Result::Failed;
      return static_cast<uint32_t>(now - startedAt_) >= RESPONSE_BUDGET_MS ? Result::Expired : Result::Pending;
    }
    if (ticket == 0 || ticket != finishedTicket_ || epoch != finishedEpoch_) return Result::Failed;
    if (static_cast<uint32_t>(now - finishedStart_) >= RESPONSE_BUDGET_MS) return Result::Expired;
    address = address_;
    return address ? Result::Resolved : Result::Failed;
  }
  const char *host() const { return host_; }
  uint32_t ticket() const { return ticket_; }
  bool active() const { return active_; }
};
} }
