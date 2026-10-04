#pragma once
#include <cstdint>
extern uint32_t testMillis;
inline uint32_t millis() { return testMillis; }
void delay(uint32_t ms);
using portMUX_TYPE = int;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(mux) ((void)(mux))
#define portEXIT_CRITICAL(mux) ((void)(mux))
