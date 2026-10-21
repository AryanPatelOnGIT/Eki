// Exercise the production owner/wait loop with controlled TCP/IP and radio APIs.
// Stubs are visible only in the native environment; board builds use the SDK.
#include "bounded_dns_resolver.h"
#include <unity.h>
uint32_t testMillis=0;
TestWiFi WiFi;
namespace {
err_t queuedResult=ERR_OK, dnsResult=ERR_OK;
bool dispatchAllowed=true, disconnectOnDelay=false;
void (*queued)(void *)=nullptr; void *queuedArgument=nullptr;
dns_found_callback pendingFound=nullptr; void *pendingArgument=nullptr;
unsigned enqueues=0, queries=0;
}
err_t tcpip_try_callback(void (*callback)(void *), void *arg) {
  ++enqueues;
  if(queuedResult!=ERR_OK) return queuedResult;
  queued=callback; queuedArgument=arg; return ERR_OK;
}
err_t dns_gethostbyname_addrtype(const char *, ip_addr_t *ip, dns_found_callback callback, void *arg, int) {
  ++queries;
  if(dnsResult==ERR_OK) ip->value=123;
  else if(dnsResult==ERR_INPROGRESS) { pendingFound=callback; pendingArgument=arg; }
  return dnsResult;
}
void delay(uint32_t ms) {
  testMillis+=ms;
  if(disconnectOnDelay) WiFi.connection=0;
  if(dispatchAllowed && queued) {
    auto callback=queued; auto arg=queuedArgument; queued=nullptr;
    callback(arg);
  }
}
void setUp() {
  testMillis=0; WiFi.connection=WL_CONNECTED; queuedResult=ERR_OK; dnsResult=ERR_OK;
  dispatchAllowed=true; disconnectOnDelay=false; queued=nullptr;
  pendingFound=nullptr; enqueues=queries=0;
}
void tearDown() {}
void cachedResolutionOnNetworkThread() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  TEST_ASSERT_TRUE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(123, ip.value);
  TEST_ASSERT_EQUAL_UINT32(1, testMillis);
  TEST_ASSERT_EQUAL_UINT32(1, queries);
}
void coldDnsStallCannotAmplifyRetries() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  dnsResult=ERR_INPROGRESS;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(1000, testMillis);
  for(int i=0;i<100;++i) TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(1, enqueues);
  TEST_ASSERT_EQUAL_UINT32(1, queries);
  const ip_addr_t late{123}; pendingFound(nullptr,&late,pendingArgument);
  dnsResult=ERR_OK;
  TEST_ASSERT_TRUE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(2, queries);
}
void stalledNetworkQueueRetainsSlot() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  dispatchAllowed=false;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(1000, testMillis);
  TEST_ASSERT_FALSE(resolver.resolve("other.example", ip));
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(1, enqueues);
  dispatchAllowed=true; delay(1);
  TEST_ASSERT_TRUE(resolver.resolve("api.example", ip));
}
void queueRejectionIsImmediateAndRetryable() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  queuedResult=ERR_MEM;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(0, testMillis);
  queuedResult=ERR_OK;
  TEST_ASSERT_TRUE(resolver.resolve("api.example", ip));
}
void dnsFailureIsRetryable() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  dnsResult=ERR_MEM;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  dnsResult=ERR_OK;
  TEST_ASSERT_TRUE(resolver.resolve("api.example", ip));
}
void offlineNeverQueues() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  WiFi.connection=0;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(0, enqueues);
}
void disconnectAndReconnectRejectOldLookup() {
  eki::dns::BoundedResolver resolver; IPAddress ip;
  dnsResult=ERR_INPROGRESS; disconnectOnDelay=true;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  resolver.networkChanged(); WiFi.connection=WL_CONNECTED; disconnectOnDelay=false;
  TEST_ASSERT_FALSE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(1, enqueues);
  const ip_addr_t late{123}; pendingFound(nullptr,&late,pendingArgument);
  dnsResult=ERR_OK;
  TEST_ASSERT_TRUE(resolver.resolve("api.example", ip));
  TEST_ASSERT_EQUAL_UINT32(2, enqueues);
}
int main() {
  UNITY_BEGIN();
  RUN_TEST(cachedResolutionOnNetworkThread);
  RUN_TEST(coldDnsStallCannotAmplifyRetries);
  RUN_TEST(stalledNetworkQueueRetainsSlot);
  RUN_TEST(queueRejectionIsImmediateAndRetryable);
  RUN_TEST(dnsFailureIsRetryable);
  RUN_TEST(offlineNeverQueues);
  RUN_TEST(disconnectAndReconnectRejectOldLookup);
  return UNITY_END();
}
