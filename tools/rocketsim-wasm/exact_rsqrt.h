#pragma once
#include <emmintrin.h>
#include <intrin.h>

#define _mm_rsqrt_ss(value) _mm_div_ss(_mm_set_ss(1.0f), _mm_sqrt_ss(value))
#define _mm_rsqrt_ps(value) _mm_div_ps(_mm_set1_ps(1.0f), _mm_sqrt_ps(value))