cmake_minimum_required(VERSION 3.16.0)
set(PROJECT_VER "s1-gnss-v1")
# The app-only legacy development build must never inherit fleet provisioning
# defaults. Its SDK is rebuilt with flash crash dumps disabled so the existing
# reserved coredump partition can serve the authenticated recovery journal.
if(SDKCONFIG MATCHES "sdkconfig\\.esp32dev-journal$")
  set(SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.journal.defaults")
endif()
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(eki-tracker)
