cmake_minimum_required(VERSION 3.16)

project(benc VERSION 1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(benc test.cpp)

target_include_directories(benc PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
