#define _GNU_SOURCE
#include "common.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/file.h>

const char* get_env(const char* key) {
    const char* v = getenv(key);
    return v ? v : "";
}

char* get_query_string(void) {
    char* qs = getenv("QUERY_STRING");
    return qs;
}

int read_stdin_into_buffer(char* buf, size_t buf_size, size_t* out_len) {
    const char* cl_str = getenv("CONTENT_LENGTH");
    if (!cl_str || !*cl_str) {
        if (out_len) *out_len = 0;
        return 0;
    }
    long to_read = strtol(cl_str, NULL, 10);
    if (to_read < 0 || (size_t)to_read >= buf_size) {
        return -1;
    }
    size_t read_total = 0;
    while (read_total < (size_t)to_read) {
        ssize_t r = read(STDIN_FILENO, buf + read_total, (size_t)to_read - read_total);
        if (r <= 0) break;
        read_total += (size_t)r;
    }
    if (out_len) *out_len = read_total;
    buf[read_total] = '\0';
    return 0;
}

static int from_hex(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return -1;
}

void url_decode(char* str) {
    if (!str) return;
    char* p = str;
    char* q = str;
    while (*p) {
        if (*p == '+') {
            *q++ = ' ';
            p++;
        } else if (*p == '%' && isxdigit((unsigned char)p[1]) && isxdigit((unsigned char)p[2])) {
            int hi = from_hex(p[1]);
            int lo = from_hex(p[2]);
            if (hi >= 0 && lo >= 0) {
                *q++ = (char)((hi << 4) | lo);
                p += 3;
            } else {
                *q++ = *p++;
            }
        } else {
            *q++ = *p++;
        }
    }
    *q = '\0';
}

int get_param(const char* query, const char* key, char* out, size_t out_size) {
    if (!query || !key || !out || out_size == 0) return 0;
    size_t key_len = strlen(key);
    const char* p = query;
    while (p && *p) {
        // find key
        const char* k = strstr(p, key);
        if (!k) break;
        // ensure key is at start or after '&'
        if (k != query && k[-1] != '&') {
            p = k + 1;
            continue;
        }
        if (k[key_len] != '=') {
            p = k + 1;
            continue;
        }
        const char* v = k + key_len + 1;
        const char* amp = strchr(v, '&');
        size_t len = amp ? (size_t)(amp - v) : strlen(v);
        if (len >= out_size) len = out_size - 1;
        memcpy(out, v, len);
        out[len] = '\0';
        url_decode(out);
        return 1;
    }
    return 0;
}

void trim_newline(char* s) {
    if (!s) return;
    size_t n = strlen(s);
    while (n > 0 && (s[n-1] == '\n' || s[n-1] == '\r')) {
        s[--n] = '\0';
    }
}

static char to_lower_char(char c) {
    if (c >= 'A' && c <= 'Z') return (char)(c - 'A' + 'a');
    return c;
}

int equals_ignore_case(const char* a, const char* b) {
    if (!a || !b) return 0;
    while (*a && *b) {
        if (to_lower_char(*a) != to_lower_char(*b)) return 0;
        a++; b++;
    }
    return *a == '\0' && *b == '\0';
}

int contains_case_insensitive(const char* haystack, const char* needle) {
    if (!haystack || !needle) return 0;
    if (*needle == '\0') return 1;
    size_t hlen = strlen(haystack);
    size_t nlen = strlen(needle);
    if (nlen > hlen) return 0;
    for (size_t i = 0; i + nlen <= hlen; ++i) {
        size_t j = 0;
        for (; j < nlen; ++j) {
            if (to_lower_char(haystack[i + j]) != to_lower_char(needle[j])) break;
        }
        if (j == nlen) return 1;
    }
    return 0;
}

static int open_locked(const char* path, int flags, int exclusive, int* out_fd) {
    int fd = open(path, flags, 0644);
    if (fd < 0) return -1;
    int op = exclusive ? LOCK_EX : LOCK_SH;
    if (flock(fd, op) != 0) {
        close(fd);
        return -1;
    }
    if (out_fd) *out_fd = fd;
    return 0;
}

static void close_unlock(int fd) {
    flock(fd, LOCK_UN);
    close(fd);
}

static int parse_line_to_record(const char* line, struct BedRecord* rec) {
    if (!line || !rec) return -1;
    char buf[512];
    strncpy(buf, line, sizeof(buf)-1);
    buf[sizeof(buf)-1] = '\0';
    trim_newline(buf);

    char* saveptr = NULL;
    char* token = strtok_r(buf, "\t", &saveptr);
    if (!token) return -1;
    strncpy(rec->hospital, token, sizeof(rec->hospital)-1);
    rec->hospital[sizeof(rec->hospital)-1] = '\0';

    token = strtok_r(NULL, "\t", &saveptr);
    if (!token) return -1;
    strncpy(rec->ward, token, sizeof(rec->ward)-1);
    rec->ward[sizeof(rec->ward)-1] = '\0';

    token = strtok_r(NULL, "\t", &saveptr);
    if (!token) return -1;
    rec->total = atoi(token);

    token = strtok_r(NULL, "\t", &saveptr);
    if (!token) return -1;
    rec->available = atoi(token);

    return 0;
}

int read_all_records(struct BedRecord* records, size_t max_records, size_t* out_count) {
    if (!records || max_records == 0) return -1;
    int fd;
    if (open_locked(DATA_FILE, O_RDONLY, 0, &fd) != 0) {
        return -1;
    }
    FILE* f = fdopen(fd, "r");
    if (!f) {
        close_unlock(fd);
        return -1;
    }
    size_t count = 0;
    char line[512];
    while (fgets(line, sizeof(line), f) && count < max_records) {
        if (line[0] == '\0' || line[0] == '\n') continue;
        struct BedRecord rec;
        if (parse_line_to_record(line, &rec) == 0) {
            records[count++] = rec;
        }
    }
    fclose(f); // also closes fd
    if (out_count) *out_count = count;
    return 0;
}

int write_all_records(struct BedRecord* records, size_t count) {
    int fd;
    if (open_locked(DATA_FILE, O_WRONLY | O_TRUNC | O_CREAT, 1, &fd) != 0) {
        return -1;
    }
    FILE* f = fdopen(fd, "w");
    if (!f) {
        close_unlock(fd);
        return -1;
    }
    for (size_t i = 0; i < count; ++i) {
        fprintf(f, "%s\t%s\t%d\t%d\n", records[i].hospital, records[i].ward,
                records[i].total, records[i].available);
    }
    fflush(f);
    int err = ferror(f);
    fclose(f);
    return err ? -1 : 0;
}

int update_or_insert_record(struct BedRecord* records, size_t* inout_count, size_t max_records,
                            const char* hospital, const char* ward, int total, int available) {
    size_t count = *inout_count;
    for (size_t i = 0; i < count; ++i) {
        if (strcmp(records[i].hospital, hospital) == 0 && strcmp(records[i].ward, ward) == 0) {
            records[i].total = total;
            records[i].available = available;
            return 0;
        }
    }
    if (count >= max_records) return -1;
    struct BedRecord nr;
    strncpy(nr.hospital, hospital, sizeof(nr.hospital)-1);
    nr.hospital[sizeof(nr.hospital)-1] = '\0';
    strncpy(nr.ward, ward, sizeof(nr.ward)-1);
    nr.ward[sizeof(nr.ward)-1] = '\0';
    nr.total = total;
    nr.available = available;
    records[count++] = nr;
    *inout_count = count;
    return 0;
}

void print_http_header_json(void) {
    printf("Content-Type: application/json\r\n\r\n");
}

void print_http_header_html(void) {
    printf("Content-Type: text/html; charset=utf-8\r\n\r\n");
}

void print_json_string(const char* s) {
    putchar('"');
    for (const unsigned char* p = (const unsigned char*)s; *p; ++p) {
        unsigned char c = *p;
        switch (c) {
            case '\\': fputs("\\\\", stdout); break;
            case '"': fputs("\\\"", stdout); break;
            case '\b': fputs("\\b", stdout); break;
            case '\f': fputs("\\f", stdout); break;
            case '\n': fputs("\\n", stdout); break;
            case '\r': fputs("\\r", stdout); break;
            case '\t': fputs("\\t", stdout); break;
            default:
                if (c < 0x20) {
                    fprintf(stdout, "\\u%04x", c);
                } else {
                    fputc(c, stdout);
                }
        }
    }
    putchar('"');
}
