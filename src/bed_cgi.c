#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#define DATA_FILE "/workspace/data/data.txt"
#define MAX_LINE 512

typedef struct {
    char hospital[128];
    char ward[32];
    int total;
    int available;
    double lat;
    double lng;
} Record;

static void html_header(void) {
    printf("Content-Type: application/json\r\n\r\n");
}

static void url_decode(char *str) {
    char *p = str;
    char code[3] = {0};
    while (*str) {
        if (*str == '+') { *p++ = ' '; }
        else if (*str == '%' && str[1] && str[2]) {
            code[0] = str[1]; code[1] = str[2];
            *p++ = (char) strtol(code, NULL, 16);
            str += 2;
        } else { *p++ = *str; }
        str++;
    }
    *p = '\0';
}

static void parse_kv(const char *query, const char *key, char *out, size_t out_size) {
    if (!query) { out[0] = '\0'; return; }
    size_t key_len = strlen(key);
    const char *p = query;
    while (p && *p) {
        const char *eq = strchr(p, '=');
        if (!eq) break;
        size_t klen = (size_t)(eq - p);
        if (klen == key_len && strncmp(p, key, key_len) == 0) {
            const char *amp = strchr(eq + 1, '&');
            size_t vlen = amp ? (size_t)(amp - (eq + 1)) : strlen(eq + 1);
            if (vlen >= out_size) vlen = out_size - 1;
            memcpy(out, eq + 1, vlen);
            out[vlen] = '\0';
            url_decode(out);
            return;
        }
        p = strchr(eq + 1, '&');
        if (p) p++;
    }
    out[0] = '\0';
}

static bool load_records(Record **out_records, size_t *out_count) {
    FILE *f = fopen(DATA_FILE, "r");
    if (!f) return false;
    char line[MAX_LINE];
    size_t capacity = 64;
    size_t count = 0;
    Record *records = (Record*) malloc(capacity * sizeof(Record));
    if (!records) { fclose(f); return false; }

    while (fgets(line, sizeof(line), f)) {
        if (line[0] == '#' || strlen(line) < 3) continue;
        Record rec;
        char hospital[128], ward[32];
        int total, available;
        double lat, lng;
        if (sscanf(line, "%127[^|]|%31[^|]|%d|%d|%lf|%lf", hospital, ward, &total, &available, &lat, &lng) == 6) {
            strncpy(rec.hospital, hospital, sizeof(rec.hospital)); rec.hospital[sizeof(rec.hospital)-1] = '\0';
            strncpy(rec.ward, ward, sizeof(rec.ward)); rec.ward[sizeof(rec.ward)-1] = '\0';
            rec.total = total; rec.available = available; rec.lat = lat; rec.lng = lng;
            if (count == capacity) {
                capacity *= 2;
                Record *tmp = (Record*) realloc(records, capacity * sizeof(Record));
                if (!tmp) { free(records); fclose(f); return false; }
                records = tmp;
            }
            records[count++] = rec;
        }
    }
    fclose(f);
    *out_records = records;
    *out_count = count;
    return true;
}

static bool save_records(const Record *records, size_t count) {
    FILE *f = fopen(DATA_FILE, "w");
    if (!f) return false;
    fprintf(f, "# hospital_name|ward_type|total_beds|available_beds|lat|lng\n");
    for (size_t i = 0; i < count; ++i) {
        fprintf(f, "%s|%s|%d|%d|%.4f|%.4f\n", records[i].hospital, records[i].ward, records[i].total, records[i].available, records[i].lat, records[i].lng);
    }
    fclose(f);
    return true;
}

static void handle_list(void) {
    Record *records = NULL; size_t count = 0;
    if (!load_records(&records, &count)) { html_header(); printf("{\"error\":\"failed to read data\"}"); return; }
    html_header();
    printf("{\"records\":[");
    for (size_t i = 0; i < count; ++i) {
        printf("{\"hospital\":\"%s\",\"ward\":\"%s\",\"total\":%d,\"available\":%d,\"lat\":%.4f,\"lng\":%.4f}%s",
               records[i].hospital, records[i].ward, records[i].total, records[i].available, records[i].lat, records[i].lng,
               (i + 1 < count) ? "," : "");
    }
    printf("]}");
    free(records);
}

static void handle_update(const char *query) {
    char hospital[128], ward[32], total_s[16], avail_s[16];
    parse_kv(query, "hospital", hospital, sizeof(hospital));
    parse_kv(query, "ward", ward, sizeof(ward));
    parse_kv(query, "total", total_s, sizeof(total_s));
    parse_kv(query, "available", avail_s, sizeof(avail_s));

    if (hospital[0] == '\0' || ward[0] == '\0') { html_header(); printf("{\"error\":\"missing params\"}"); return; }

    int total = (total_s[0] ? atoi(total_s) : -1);
    int available = (avail_s[0] ? atoi(avail_s) : -1);

    Record *records = NULL; size_t count = 0;
    if (!load_records(&records, &count)) { html_header(); printf("{\"error\":\"failed to read data\"}"); return; }

    bool found = false;
    for (size_t i = 0; i < count; ++i) {
        if (strcmp(records[i].hospital, hospital) == 0 && strcmp(records[i].ward, ward) == 0) {
            if (total >= 0) records[i].total = total;
            if (available >= 0) records[i].available = available;
            found = true;
            break;
        }
    }

    if (!found) {
        // If not exists, append with lat/lng as 0
        if (count % 16 == 0) {
            Record *tmp = (Record*) realloc(records, (count + 16) * sizeof(Record));
            if (!tmp) { html_header(); printf("{\"error\":\"mem error\"}"); free(records); return; }
            records = tmp;
        }
        Record rec;
        strncpy(rec.hospital, hospital, sizeof(rec.hospital)); rec.hospital[sizeof(rec.hospital)-1] = '\0';
        strncpy(rec.ward, ward, sizeof(rec.ward)); rec.ward[sizeof(rec.ward)-1] = '\0';
        rec.total = (total >= 0) ? total : 0;
        rec.available = (available >= 0) ? available : 0;
        rec.lat = 0.0; rec.lng = 0.0;
        records[count++] = rec;
    }

    if (!save_records(records, count)) { html_header(); printf("{\"error\":\"failed to write data\"}"); free(records); return; }
    html_header();
    printf("{\"status\":\"ok\"}");
    free(records);
}

int main(void) {
    const char *query = getenv("QUERY_STRING");
    const char *path = getenv("PATH_INFO");

    if (!path) path = "/list"; // default

    if (strcmp(path, "/list") == 0) {
        handle_list();
    } else if (strcmp(path, "/update") == 0) {
        handle_update(query ? query : "");
    } else {
        html_header(); printf("{\"error\":\"unknown endpoint\"}");
    }
    return 0;
}
