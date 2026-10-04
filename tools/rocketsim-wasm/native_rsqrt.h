#pragma once
#include <bit>
#include <cstdint>
#include <emmintrin.h>
#include <cmath>
#include "rsqrt_table.generated.h"

inline float nativeRsqrtEstimate(float value) {
    const auto bits = std::bit_cast<std::uint32_t>(value);
    const unsigned exponent = (bits >> 23) & 255;
    const unsigned mantissa = bits & 0x7fffff;
    if (exponent == 0) return std::bit_cast<float>((bits & 0x80000000u) | 0x7f800000u);
    if (exponent == 255 && mantissa != 0) return std::bit_cast<float>(bits | 0x00400000u);
    if (bits & 0x80000000u) return std::bit_cast<float>(0xffc00000u);
    if (exponent == 255) return 0.0f;
    const unsigned canonical = exponent % 2 ? 127 : 128;
    const int adjustment = (static_cast<int>(canonical) - static_cast<int>(exponent)) / 2;
    const auto estimate = nativeRsqrtTable[(canonical - 127) * 1024 + (mantissa >> 13)];
    return std::bit_cast<float>(estimate + adjustment * 0x800000u);
}

inline __m128 nativeRsqrtScalar(__m128 value) {
    return _mm_move_ss(value, _mm_set_ss(nativeRsqrtEstimate(_mm_cvtss_f32(value))));
}

inline __m128 nativeRsqrtVector(__m128 value) {
    float lanes[4];
    _mm_storeu_ps(lanes, value);
    for (auto& lane : lanes) lane = nativeRsqrtEstimate(lane);
    return _mm_loadu_ps(lanes);
}

#undef _mm_rsqrt_ss
#undef _mm_rsqrt_ps
#define _mm_rsqrt_ss(value) nativeRsqrtScalar(value)
#define _mm_rsqrt_ps(value) nativeRsqrtVector(value)

inline float nativeCosine(float value) {
    if (std::fabs(value) >= 1.f / 128.f) return static_cast<float>(std::cos(static_cast<double>(value)));
    const float square = value * value;
    return 1.f - square * .5f;
}

#define cosf(value) nativeCosine(value)

inline float nativeAtan2(float vertical, float horizontal) {
    return static_cast<float>(std::atan2(static_cast<double>(vertical), static_cast<double>(horizontal)));
}

#define atan2f(vertical, horizontal) nativeAtan2(vertical, horizontal)