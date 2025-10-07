#include "common.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static int parse_int(const char* s, int* out) {
    if (!s || !*s) return -1;
    char* end = NULL;
    long v = strtol(s, &end, 10);
    if (*end != '\0') return -1;
    if (v < 0 || v > 1000000) return -1;
    *out = (int)v;
    return 0;
}

int main(void) {
    const char* method = get_env("REQUEST_METHOD");

    char body[2048] = {0};
    if (strcmp(method, "POST") == 0) {
        size_t len = 0;
        if (read_stdin_into_buffer(body, sizeof(body), &len) != 0) {
            print_http_header_json();
            printf("{\"success\":false,\"error\":\"invalid body\"}\n");
            return 0;
        }
    } else {
        const char* qs = get_query_string();
        if (qs) {
            strncpy(body, qs, sizeof(body)-1);
        }
    }

    char hospital[128] = {0};
    char ward[32] = {0};
    char total_s[32] = {0};
    char available_s[32] = {0};

    get_param(body, "hospital", hospital, sizeof(hospital));
    get_param(body, "ward", ward, sizeof(ward));
    get_param(body, "total", total_s, sizeof(total_s));
    get_param(body, "available", available_s, sizeof(available_s));

    int total = 0, available = 0;

    if (!hospital[0] || !ward[0] || parse_int(total_s, &total) != 0 || parse_int(available_s, &available) != 0) {
        print_http_header_json();
        printf("{\"success\":false,\"error\":\"missing or invalid parameters\"}\n");
        return 0;
    }

    if (available > total) {
        print_http_header_json();
        printf("{\"success\":false,\"error\":\"available cannot exceed total\"}\n");
        return 0;
    }

    struct BedRecord records[4096];
    size_t count = 0;
    if (read_all_records(records, 4096, &count) != 0) {
        // if file missing, we will start fresh
        count = 0;
    }

    if (update_or_insert_record(records, &count, 4096, hospital, ward, total, available) != 0) {
        print_http_header_json();
        printf("{\"success\":false,\"error\":\"storage full\"}\n");
        return 0;
    }

    if (write_all_records(records, count) != 0) {
        print_http_header_json();
        printf("{\"success\":false,\"error\":\"write failed\"}\n");
        return 0;
    }

    print_http_header_json();
    printf("{\"success\":true,\"record\":{");
    printf("\"hospital\":");
    print_json_string(hospital);
    printf(",\"ward\":");
    print_json_string(ward);
    printf(",\"total\":%d,\"available\":%d}}\n", total, available);

    return 0;
}
