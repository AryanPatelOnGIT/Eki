#include "dns_resolution_policy.h"
#include <unity.h>
#include <string>
using namespace eki::dns;
void setUp() {}
void tearDown() {}
void coldAndWarmSuccess() {
  ResolutionState s; uint32_t ip;
  auto cold = s.begin("api.example", 1, 10);
  TEST_ASSERT_TRUE(cold.admission == Admission::Started);
  TEST_ASSERT_TRUE(s.poll(cold.ticket, 1, 20, ip) == Result::Pending);
  TEST_ASSERT_TRUE(s.complete(cold.ticket, 1, 123, 400));
  TEST_ASSERT_TRUE(s.poll(cold.ticket, 1, 401, ip) == Result::Resolved);
  TEST_ASSERT_EQUAL_UINT32(123, ip);
  auto warm = s.begin("api.example", 1, 500);
  TEST_ASSERT_TRUE(s.complete(warm.ticket, 1, 456, 500));
  TEST_ASSERT_TRUE(s.poll(warm.ticket, 1, 500, ip) == Result::Resolved);
  TEST_ASSERT_EQUAL_UINT32(456, ip);
}
void oneSlotAndSharedWaiters() {
  ResolutionState s;
  auto first = s.begin("api.example", 1, 10);
  for (int i=0; i<1000; ++i) {
    auto joined = s.begin("api.example", 1, 20);
    TEST_ASSERT_TRUE(joined.admission == Admission::Waiting);
    TEST_ASSERT_EQUAL_UINT32(first.ticket, joined.ticket);
    TEST_ASSERT_TRUE(s.begin("other.example", 1, 20).admission == Admission::Rejected);
  }
  TEST_ASSERT_TRUE(s.begin("api.example", 2, 20).admission == Admission::Rejected);
}
void timeoutRetainsUnderlyingOwner() {
  ResolutionState s; uint32_t ip;
  auto first = s.begin("api.example", 1, 0);
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 999, ip) == Result::Pending);
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 1000, ip) == Result::Expired);
  TEST_ASSERT_TRUE(s.active());
  TEST_ASSERT_TRUE(s.begin("other.example", 1, 5000).admission == Admission::Rejected);
  TEST_ASSERT_TRUE(s.begin("api.example", 1, 5000).admission == Admission::Waiting);
  TEST_ASSERT_TRUE(s.complete(first.ticket, 1, 123, 5000));
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 5001, ip) == Result::Expired);
  TEST_ASSERT_EQUAL_UINT32(0, ip);
  TEST_ASSERT_TRUE(s.begin("api.example", 1, 5002).admission == Admission::Started);
}
void networkChangeRejectsOldAddresses() {
  ResolutionState s; uint32_t ip;
  auto first = s.begin("api.example", 1, 0);
  TEST_ASSERT_TRUE(s.poll(first.ticket, 2, 10, ip) == Result::Failed);
  TEST_ASSERT_TRUE(s.complete(first.ticket, 2, 123, 20));
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 21, ip) == Result::Failed);
  TEST_ASSERT_EQUAL_UINT32(0, ip);
  auto next = s.begin("api.example", 2, 30);
  TEST_ASSERT_TRUE(s.complete(next.ticket, 2, 456, 40));
  TEST_ASSERT_TRUE(s.poll(next.ticket, 2, 41, ip) == Result::Resolved);
}
void staleCompletionsCannotOverwriteNewJob() {
  ResolutionState s; uint32_t ip;
  auto old = s.begin("api.example", 1, 0);
  s.complete(old.ticket, 1, 123, 10);
  auto next = s.begin("api.example", 1, 20);
  TEST_ASSERT_FALSE(s.complete(old.ticket, 1, 789, 30));
  TEST_ASSERT_TRUE(s.poll(next.ticket, 1, 31, ip) == Result::Pending);
  TEST_ASSERT_TRUE(s.complete(next.ticket, 1, 456, 40));
  TEST_ASSERT_TRUE(s.poll(next.ticket, 1, 41, ip) == Result::Resolved);
  TEST_ASSERT_EQUAL_UINT32(456, ip);
}
void failureAndFinishedDeadline() {
  ResolutionState s; uint32_t ip;
  auto first = s.begin("api.example", 1, 0);
  s.complete(first.ticket, 1, 0, 10);
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 11, ip) == Result::Failed);
  auto next = s.begin("api.example", 1, 20);
  s.complete(next.ticket, 1, 123, 21);
  TEST_ASSERT_TRUE(s.poll(next.ticket, 1, 1020, ip) == Result::Expired);
  TEST_ASSERT_EQUAL_UINT32(0, ip);
}
void invalidHostnamesNeverTakeSlot() {
  ResolutionState s;
  TEST_ASSERT_TRUE(s.begin(nullptr, 1, 0).admission == Admission::Rejected);
  TEST_ASSERT_TRUE(s.begin("", 1, 0).admission == Admission::Rejected);
  TEST_ASSERT_TRUE(s.begin(std::string(254, 'a').c_str(), 1, 0).admission == Admission::Rejected);
  TEST_ASSERT_FALSE(s.active());
  TEST_ASSERT_TRUE(s.begin(std::string(253, 'a').c_str(), 1, 0).admission == Admission::Started);
}
void millisWrapKeepsDeadline() {
  ResolutionState s; uint32_t ip;
  auto first = s.begin("api.example", 1, UINT32_MAX - 499);
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 499, ip) == Result::Pending);
  TEST_ASSERT_TRUE(s.poll(first.ticket, 1, 500, ip) == Result::Expired);
  TEST_ASSERT_TRUE(s.complete(first.ticket, 1, 123, 500));
  TEST_ASSERT_EQUAL_UINT32(0, ip);
}
int main() {
  UNITY_BEGIN();
  RUN_TEST(coldAndWarmSuccess);
  RUN_TEST(oneSlotAndSharedWaiters);
  RUN_TEST(timeoutRetainsUnderlyingOwner);
  RUN_TEST(networkChangeRejectsOldAddresses);
  RUN_TEST(staleCompletionsCannotOverwriteNewJob);
  RUN_TEST(failureAndFinishedDeadline);
  RUN_TEST(invalidHostnamesNeverTakeSlot);
  RUN_TEST(millisWrapKeepsDeadline);
  return UNITY_END();
}
