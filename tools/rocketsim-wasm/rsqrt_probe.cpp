#include <bit>
#include <cstdint>
#include <array>
#include <fstream>
#include <iostream>
#include <xmmintrin.h>

int main(int argc, char** argv) {
    unsigned inputShift = 23;
    std::uint32_t previous = 0;
    for (std::uint32_t bits = 0x3f800000; bits < 0x40800000; ++bits) {
        const auto estimate = _mm_cvtss_f32(_mm_rsqrt_ss(_mm_set_ss(std::bit_cast<float>(bits))));
        const auto result = std::bit_cast<std::uint32_t>(estimate);
        if (bits != 0x3f800000 && result != previous) {
            const auto alignment = static_cast<unsigned>(std::countr_zero(bits));
            if (alignment < inputShift) inputShift = alignment;
        }
        previous = result;
    }
    std::cout << "verified input shift: " << inputShift << '\n';
    std::cout << "table entries: " << (2u << (23 - inputShift)) << '\n';
    if (inputShift != 13) return 1;
    std::array<std::uint32_t, 2048> table;
    for (unsigned index = 0; index < table.size(); ++index) {
        const auto value = std::bit_cast<float>(0x3f800000u + (index << 13));
        table[index] = std::bit_cast<std::uint32_t>(_mm_cvtss_f32(_mm_rsqrt_ss(_mm_set_ss(value))));
    }
    for (unsigned exponent = 1; exponent < 255; ++exponent) {
        const unsigned canonical = exponent % 2 ? 127 : 128;
        const int adjustment = (static_cast<int>(canonical) - static_cast<int>(exponent)) / 2;
        for (unsigned mantissa = 0; mantissa < 1024; ++mantissa) {
            const auto bits = (exponent << 23) | (mantissa << 13);
            const auto actual = std::bit_cast<std::uint32_t>(_mm_cvtss_f32(_mm_rsqrt_ss(_mm_set_ss(std::bit_cast<float>(bits)))));
            const auto expected = table[(canonical - 127) * 1024 + mantissa] + adjustment * 0x800000u;
            if (actual != expected) return 1;
        }
    }
    std::cout << "all normal exponent bins verified\n";
    if (argc == 2) {
        std::ofstream output(argv[1]);
        output << "#pragma once\n#include <cstdint>\ninline constexpr std::uint32_t nativeRsqrtTable[2048] = {\n";
        for (unsigned index = 0; index < table.size(); ++index) {
            output << table[index] << "u," << (index % 8 == 7 ? '\n' : ' ');
        }
        output << "};\n";
        if (!output) return 1;
    }
}