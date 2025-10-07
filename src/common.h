#ifndef COMMON_H
#define COMMON_H

#include <stddef.h>

#define DATA_FILE "/workspace/data/data.txt"

struct BedRecord {
    char hospital[128];
    char ward[32];
    int total;
    int available;
};

// URL/form helpers
const char* get_env(const char* key);
char* get_query_string(void);
int read_stdin_into_buffer(char* buf, size_t buf_size, size_t* out_len);
void url_decode(char* str);
int get_param(const char* query, const char* key, char* out, size_t out_size);

// Data I/O
int read_all_records(struct BedRecord* records, size_t max_records, size_t* out_count);
int write_all_records(struct BedRecord* records, size_t count);
int update_or_insert_record(struct BedRecord* records, size_t* inout_count, size_t max_records,
                            const char* hospital, const char* ward, int total, int available);

// Utils
void print_http_header_json(void);
void print_http_header_html(void);
void print_json_string(const char* s);
void trim_newline(char* s);
int equals_ignore_case(const char* a, const char* b);
int contains_case_insensitive(const char* haystack, const char* needle);

#endif // COMMON_H
