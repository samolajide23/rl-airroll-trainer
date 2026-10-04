#pragma once
#include <smmintrin.h>
#include <cmath>

inline void __cpuid(int* values, int) {
    values[0] = values[1] = values[3] = 0;
    values[2] = (1 << 12) | (1 << 19) | (1 << 27) | (1 << 28);
}

inline unsigned long long _xgetbv(unsigned) { return 6; }

inline __m128 nativeFusedMultiplyAdd(__m128 left, __m128 right, __m128 addend, bool negate) {
    float leftLanes[4], rightLanes[4], addendLanes[4];
    _mm_storeu_ps(leftLanes, left);
    _mm_storeu_ps(rightLanes, right);
    _mm_storeu_ps(addendLanes, addend);
    for (int lane = 0; lane < 4; lane++)
        leftLanes[lane] = std::fma(negate ? -leftLanes[lane] : leftLanes[lane], rightLanes[lane], addendLanes[lane]);
    return _mm_loadu_ps(leftLanes);
}

#define _mm_fmadd_ps(left, right, addend) nativeFusedMultiplyAdd(left, right, addend, false)
#define _mm_fnmadd_ps(left, right, addend) nativeFusedMultiplyAdd(left, right, addend, true)