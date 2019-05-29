"""Functions to read and write AFD configuration files.
"""
import os.path

HC_FIELD_NAME = 0
HC_FIELD_RADIO = 1
HC_FIELD_DEFAULT = 2
HC_FIELD_COLUMN = 3
HC_FIELD_BIT = 4

"""These field names tuple represent the fields in HOST_CONFIG.
Important is their exact order!
Fields for columns 3 (HostToggle) and 14 (SpecialFlag) and 20 (duplicate-check)
are flags, where the value "bit" in the tuple denotes the bit to set. If this
field "bit" is set to a value >=0 bit-arithmetic is applied.
For html-radio-input the column "radio-value" is taken in, too.
Special case: the fields "host_switch_*" are combined into one column.
"""
HC_FIELDS = (
    # field-name, radio-value, default, column, bit
    ("alias", None, "", 0, -1),  # AH
    ("host_name_real1", None, "", 1 , -1),  # HN1
    ("host_name_real2", None, "", 2 , -1),  # HN2
    ("host_switch_enable", None, "no", 3 , -2),  # HT
    ("host_switch_char1", None, "", 3, -2),  # HT
    ("host_switch_char2", None, "" , 3, -2),  # HT
    ("host_switch_auto", None, "no", 3, -2),  # HT    yes:{} no:[]
    ("proxy_name", None, "", 4, -1),  # PXY
    ("max_parallel_transfer", None, "3", 5, -1),  # AT
    ("max_errors", None, "10", 6, -1),  # ME
    ("retry_interval", None, "120", 7, -1),  # RI
    ("transfer_block_size", None, "4 KB", 8, -1),  # TB
    ("successful_retries", None, "0", 9, -1),  # SR
    ("filesize_offset_for_append", None, "None", 10, -1),  # FSO
    ("transfer_timeout", None, "60", 11, -1),  # TT
    ("no_burst", None, "0", 12, -1),  # NB
    ("host_status", None, "0", 13, -1),  # HS - Irrelevant for HC-edit page!
    ("ftp_mode_passive", None, "no", 14, 0),  # SF:1 - FTP passive mode
    ("ftp_idle_time", None, "no", 14, 1),  # SF:2 - Set FTP idle time to transfer timeout
    ("ftp_keep_alive", None, "no", 14, 2),  # SF:3 - Send STAT command to keep control connection alive.
    ("ftp_fast_rename", None, "no", 14, 3),  # SF:4 - Combine RNFR and RNTO to one command.
    ("ftp_fast_cd", None, "no", 14, 4),  # SF:5 - Do not do a cd, always use absolute path.
    ("ftp_no_type_i", None, "no", 14, 5),  # SF:6 - Do not send TYPE I command.
    ("ftp_mode_epsv", None, "", 14, 6),  # SF:7 - Use extended active or extended passive mode.
    ("disable_burst", None, "", 14, 7),  # SF:8 - If set bursting is disabled.
    ("ftp_allow_redirect", None, "", 14, 8),  # SF:9 - If set FTP passive mode allows to be redirected to another address.
    ("use_local_scheme", None, "", 14, 9),  # SF:10 - When set it will replace the given scheme with file if the hostname matches local hostname or one in local_interface.list.
    ("tcp_keep_alive", None, "", 14, 10),  # SF:11 - Set TCP keepalive.
    ("sequence_locking", None, "", 14, 11),  # SF:12 - Set sequence locking.
    ("enable_compress", None, "", 14, 12),  # SF:13 - Enable compression.
    ("keep_timestamp", None, "", 14, 13),  # SF:14 - Keep time stamp of source file.
    ("sort_names", None, "", 14, 14),  # SF:15 - Sort file names.
    ("no_ageing_jobs", None, "", 14, 15),  # SF:16 - No ageing jobs.
    ("check_local_remote_match_size", None, "", 14, 16),  # SF:17 - Check if local and remote size match.
    ("is_timeout_transfer", None, "", 14, 17),  # SF:18 - Timeout transfer.
    ("keep_connected_direction", "send", "", 14, 18),  # SF:19 - Keep connected no fetching.
    ("keep_connected_direction", "fetch", "", 14, 19),  # SF:20 - Keep connected no sending.
    ("ftps_clear_ctrlcon", None, "", 14, 20),  # SF:21 - FTPS Clear Control Connection.
    ("ftp_use_list", None, "", 14, 21),  # SF:22 - Use FTP LIST for directory listing.
    ("tls_strict_verification", None, "", 14, 22),  # SF:23 - TLS uses strict verification of host.
    ("ftp_disable_mlst", None, "", 14, 23),  # SF:24 - Disables FTP MLST for directory listing.
    ("keep_connected_disconnect", None, "", 14, 24),  # SF:25 - Disconnect after given keep connected time.
    ("transfer_rate_limit", None, "0", 15, -1),  # TRL
    ("time_to_live", None, "0", 16, -1),  # TTL
    ("socket_send_buffer", None, "", 17, -1),  # SSB
    ("socket_receive_buffer", None, "", 18, -1),  # SRB
    ("dupcheck_timeout", None, "", 19, -1),  # DT
    ("dupcheck_type", "name", "", 20, 0),  # DF:1 - Only do CRC checksum for filename.
    ("dupcheck_type", "content", "", 20, 1),  # DF:2 - Only do CRC checksum for file content.
    ("dupcheck_type", "name-content", "", 20, 2),  # DF:3 - Checksum for filename and content.
    ("dupcheck_type", "name-no-suffix", "", 20, 3),  # DF:4 - Checksum of filename without last suffix.
    ("dupcheck_type", "name-size", "", 20, 4),  # DF:5 - Checksum of filename and size.
    ("dupcheck_crc", "crc32", "", 20, 15),  # DF:16 - Do a CRC32 checksum.
    ("dupcheck_crc", "crc32c", "", 20, 16),  # DF:17 - Do a CRC32C checksum.
    ("dupcheck_delete", None, "", 20, 23),  # DF:24 - Delete the file.
    ("dupcheck_store", None, "", 20, 24),  # DF:25 - Store the duplicate file.
    ("dupcheck_warn", None, "", 20, 25),  # DF:26 - Warn in SYSTEM_LOG.
    ("dupcheck_timeout_fixed", None, "", 20, 30),  # DF:31 - Timeout is fixed, ie. not cumulative.
    ("dupcheck_reference", "recipient", "", 20, 31),  # DF:32 - Use full recipient as reference instead of alias name.
    ("keep_connected", None, "", 21, -1),  # KC
    ("warn_time", None, "", 22, -1),  # WT    = warn_time_days+warn_time_hours+warn_time_mins+warn_time_secs
)


def read_hostconfig(afd_work_dir):
    hc_order = []
    hc_data = {}

    def int_or_str(s):
        try:
            return int(s)
        except:
            return s

    with open(os.path.join(afd_work_dir, "etc", "HOST_CONFIG"), "rt") as fh_hc:
        for line in fh_hc:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line_data = line.split(":")
            hc_order.append(line_data[HC_FIELD_NAME])
            hc_data[line_data[HC_FIELD_NAME]] = {}
            for hc_field in HC_FIELDS:
                print(hc_field[HC_FIELD_COLUMN], line_data[hc_field[HC_FIELD_COLUMN]])
                if hc_field[HC_FIELD_BIT] >= 0:
                    if int(line_data[hc_field[HC_FIELD_COLUMN]]) & (1 << hc_field[HC_FIELD_BIT]):
                        value = hc_field[HC_FIELD_RADIO] or "yes"
                    else:
                        value = "no"
                elif hc_field[3] == -2:
                    if line_data[hc_field[HC_FIELD_COLUMN]] != "":
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "yes"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = "yes" if line_data[hc_field[HC_FIELD_COLUMN]][0] == "{" else "no"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char1"] = line_data[hc_field[HC_FIELD_COLUMN]][1]
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char2"] = line_data[hc_field[HC_FIELD_COLUMN]][2]
                    else:
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "no"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = "no"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char1"] = ""
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char2"] = ""
                else:
                    value = line_data[hc_field[HC_FIELD_COLUMN]]
                hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]] = int_or_str(value)
    return {"order":hc_order, "data":hc_data}


def save_hostconfig(afd_work_dir, form):
    tmp_fn_hc = os.path.join(afd_work_dir, "etc", ".HOST_CONFIG")
    # Read current content of HOST_CONFIG
    hc = read_hostconfig()
    if form.get("submit") == "order":
        # Replace the host order
        hc["order"] = form["order"]
    if form.get("submit") == "data":
        # Replace all values for one host with those from the request.form
        hc["data"][form["alias"]] = {n[0]:form.get(n[0], "")
                                     for n
                                     in HC_FIELDS}
    with open(tmp_fn_hc, "wt") as fh_hc:
        # Write a new HOST_CONFIG to a temporary file.
        for alias in hc["order"]:
            line_data = [None * 23]
            hc_toggle = {}
            for tuplevalue_field, tuplevalue_radio, tuplevalue_default, tuplevalue_column, tuplevalue_bit in HC_FIELDS:
                if tuplevalue_bit >= 0:
                    column_value = line_data[tuplevalue_column]
                    if column_value is None:
                        column_value = 0
                    if hc["data"][alias].get(tuplevalue_field, "no") in ("yes", tuplevalue_radio):
                        column_value = column_value | 1 << tuplevalue_bit
                    else:
                        column_value = column_value & ~(1 << tuplevalue_bit)
                    line_data[tuplevalue_column] = column_value
                elif tuplevalue_bit == -1:
                    line_data[tuplevalue_column] = hc["data"][alias].get(tuplevalue_field, tuplevalue_default)
                elif tuplevalue_bit == -2:
                    hc_toggle[tuplevalue_field] = hc["data"][alias][tuplevalue_field]
            if hc_toggle["host_switch_enable"] == "yes":
                if hc_toggle["host_switch_auto"] == "yes":
                    line_data[3] = "\{{host_switch_char1}{host_switch_char2}\}".format(**hc_toggle)
                else:
                    line_data[3] = "[{host_switch_char1}{host_switch_char2}]".format(**hc_toggle)
            else:
                line_data[3] = ""
            fh_hc.write(":".join(line_data), end="\n")
    # TODO: Replace original HOST_CONFIG with our temporary one

