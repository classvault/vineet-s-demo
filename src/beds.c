#include "common.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

int main(void) {
    print_http_header_json();

    char hospital_filter[128] = {0};
    char ward_filter[32] = {0};

    const char* method = get_env("REQUEST_METHOD");
    char query_buf[2048] = {0};

    if (strcmp(method, "POST") == 0) {
        size_t len = 0;
        if (read_stdin_into_buffer(query_buf, sizeof(query_buf), &len) != 0) {
            printf("{\"success\":false,\"error\":\"invalid request body\"}\n");
            return 0;
        }
    } else {
        const char* qs = get_query_string();
        if (qs) {
            strncpy(query_buf, qs, sizeof(query_buf)-1);
        }
    }

    get_param(query_buf, "hospital", hospital_filter, sizeof(hospital_filter));
    get_param(query_buf, "ward", ward_filter, sizeof(ward_filter));

    struct BedRecord records[2048];
    size_t count = 0;
    if (read_all_records(records, 2048, &count) != 0) {
        printf("{\"success\":false,\"error\":\"data read failed\"}\n");
        return 0;
    }

    time_t now = time(NULL);

    printf("{\"success\":true,\"updatedAt\":%ld,\"data\":[", (long)now);
    int first = 1;
    for (size_t i = 0; i < count; ++i) {
        if (hospital_filter[0] && !contains_case_insensitive(records[i].hospital, hospital_filter)) continue;
        if (ward_filter[0] && !equals_ignore_case(records[i].ward, ward_filter)) continue;
        if (!first) printf(",");
        first = 0;
        printf("{\"hospital\":");
        print_json_string(records[i].hospital);
        printf(",\"ward\":");
        print_json_string(records[i].ward);
        printf(",\"total\":%d,\"available\":%d}", records[i].total, records[i].available);
    }
    printf("]}\n");
    return 0;
}
