CC=gcc
CFLAGS=-O2 -Wall -Wextra -std=c11
LDFLAGS=

SRC_DIR=src
CGI_DIR=cgi-bin

COMMON=$(SRC_DIR)/common.c $(SRC_DIR)/common.h

all: $(CGI_DIR)/beds.cgi $(CGI_DIR)/update_beds.cgi

$(CGI_DIR):
	mkdir -p $(CGI_DIR)

$(CGI_DIR)/beds.cgi: $(SRC_DIR)/beds.c $(COMMON) | $(CGI_DIR)
	$(CC) $(CFLAGS) -o $@ $(SRC_DIR)/beds.c $(SRC_DIR)/common.c $(LDFLAGS)
	chmod +x $@

$(CGI_DIR)/update_beds.cgi: $(SRC_DIR)/update_beds.c $(COMMON) | $(CGI_DIR)
	$(CC) $(CFLAGS) -o $@ $(SRC_DIR)/update_beds.c $(SRC_DIR)/common.c $(LDFLAGS)
	chmod +x $@

clean:
	rm -f $(CGI_DIR)/*.cgi

.PHONY: all clean
