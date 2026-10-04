#pragma once
#include <cstdint>
constexpr int WL_CONNECTED = 3;
struct IPAddress {
  uint32_t value = 0;
  IPAddress &operator=(uint32_t ip) { value=ip; return *this; }
};
struct TestWiFi { int connection=WL_CONNECTED; int status() const { return connection; } };
extern TestWiFi WiFi;
