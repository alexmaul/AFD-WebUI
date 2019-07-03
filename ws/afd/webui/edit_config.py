"""Functions to read and write AFD configuration files.
"""
import os.path
from subprocess import check_output

HC_FIELD_NAME = 0
HC_FIELD_RADIO = 1
HC_FIELD_DEFAULT = 2
HC_FIELD_COLUMN = 3
HC_FIELD_BIT = 4

"""These field names tuple represent the fields in HOST_CONFIG.
Important is their exact order!
Fields for columns 3 (HostToggle) and 14 (SpecialFlag) and 20 (duplicate-check)
are flags, where the value of "bit" in the tuple denotes the bit to set.
If this field "bit" is set to a value >=0, then bit-arithmetic is applied.
For html-radio-input the column "radio-value" is taken in, too.
Special case: the fields "host_switch_*" are combined into one column.
"""
HC_FIELDS = (
    # field-name, radio-value, default, column, bit
    ("alias", None, "", 0, -1),  #                           AH - Alias hostname
    ("host_name_real1", None, "", 1 , -1),  #                HN1 - Real hostname 1
    ("host_name_real2", None, "", 2 , -1),  #                HN2 - Real hostname 2
    ("host_switch_enable", None, "no", 3 , -2),  #           HT - Host toggle enable
    ("host_switch_char1", None, "", 3, -2),  #               HT - Host toggle character 1
    ("host_switch_char2", None, "" , 3, -2),  #              HT - Host toggle character 2
    ("host_switch_auto", None, "no", 3, -2),  #              HT - Automatic host switching: yes={}, no=[]
    ("proxy_name", None, "", 4, -1),  #                      PXY - Proxy name
    ("max_parallel_transfer", None, "3", 5, -1),  #          AT - Allowed transfers
    ("max_errors", None, "10", 6, -1),  #                    ME - Max. errors
    ("retry_interval", None, "120", 7, -1),  #               RI - Retry interval
    ("transfer_block_size", None, "4 KB", 8, -1),  #         TB - Transfer block size
    ("successful_retries", None, "0", 9, -1),  #             SR - Successful retries
    ("filesize_offset_for_append", None, "None", 10, -1),  # FSO - File size offset
    ("transfer_timeout", None, "60", 11, -1),  #             TT - Transfer timeout
    ("no_burst", None, "0", 12, -1),  #                      NB - Number of no bursts
    ("host_status", None, "0", 13, -1),  #                   HS - Mostly irrelevant for HC-edit page!
    ("ignore_error_warning", None, "no", 13, 4),  #          HS:5  - Error status offline
    ("do_not_delete", None, "no", 13, 15),  #                HS:16 - Do not delete files due age-limit and 'delete queued files'

#                          1 (1)     - If set transfer is stopped for this host.
#                          2 (2)     - If set queue is stopped for this host.
#                          3 (4)     - If set host is NOT in DIR_CONFIG.
# ignore_error_warning     5 (16)    - Error status offline.
#                          6 (32)    - If set this host is disabled.
#                          7 (64)    - If set and host switching is used
#                                      this tells that host two is active.
# do_not_delete            16(32768) - If set do not delete files due to
#                                      age-limit and 'delete queued files'
#                                      option.

    ("ftp_mode_passive", None, "no", 14, 0),  #              SF:1 - FTP passive mode
    ("ftp_idle_time", None, "no", 14, 1),  #                 SF:2 - Set FTP idle time to transfer timeout
    ("ftp_keep_alive", None, "no", 14, 2),  #                SF:3 - Send STAT command to keep control connection alive.
    ("ftp_fast_rename", None, "no", 14, 3),  #               SF:4 - Combine RNFR and RNTO to one command.
    ("ftp_fast_cd", None, "no", 14, 4),  #                   SF:5 - Do not do a cd, always use absolute path.
    ("ftp_no_type_i", None, "no", 14, 5),  #                 SF:6 - Do not send TYPE I command.
    ("ftp_mode_epsv", None, "no", 14, 6),  #                 SF:7 - Use extended active or extended passive mode.
    ("disable_burst", None, "no", 14, 7),  #                 SF:8 - If set bursting is disabled.
    ("ftp_allow_redirect", None, "no", 14, 8),  #            SF:9 - If set FTP passive mode allows to be redirected to another address.
    ("use_local_scheme", None, "no", 14, 9),  #              SF:10 - When set it will replace the given scheme with file if the hostname matches local hostname or one in local_interface.list.
    ("tcp_keep_alive", None, "no", 14, 10),  #               SF:11 - Set TCP keepalive.
    ("sequence_locking", None, "no", 14, 11),  #             SF:12 - Set sequence locking.
    ("enable_compress", None, "no", 14, 12),  #              SF:13 - Enable compression.
    ("keep_timestamp", None, "no", 14, 13),  #               SF:14 - Keep time stamp of source file.
    ("sort_names", None, "no", 14, 14),  #                   SF:15 - Sort file names.
    ("no_ageing_jobs", None, "no", 14, 15),  #               SF:16 - No ageing jobs.
    ("check_local_remote_match_size", None, "no", 14, 16),  # SF:17 - Check if local and remote size match.
    ("is_timeout_transfer", None, "no", 14, 17),  #          SF:18 - Timeout transfer.
    ("keep_connected_direction", "send", "no", 14, 18),  #   SF:19 - Keep connected no fetching.
    ("keep_connected_direction", "fetch", "no", 14, 19),  #  SF:20 - Keep connected no sending.
    ("ftps_clear_ctrlcon", None, "no", 14, 20),  #           SF:21 - FTPS Clear Control Connection.
    ("ftp_use_list", None, "no", 14, 21),  #                 SF:22 - Use FTP LIST for directory listing.
    ("tls_strict_verification", None, "no", 14, 22),  #      SF:23 - TLS uses strict verification of host.
    ("ftp_disable_mlst", None, "no", 14, 23),  #             SF:24 - Disables FTP MLST for directory listing.
    ("keep_connected_disconnect", None, "no", 14, 24),  #    SF:25 - Disconnect after given keep connected time.
    ("transfer_rate_limit", None, "0", 15, -1),  #           TRL - Transfer rate limit
    ("time_to_live", None, "0", 16, -1),  #                  TTL - TCP time-to-live
    ("socket_send_buffer", None, "0", 17, -1),  #            SSB - Socket send buffer
    ("socket_receive_buffer", None, "0", 18, -1),  #         SRB - Socket receive buffer
    ("dupcheck_timeout", None, "0", 19, -1),  #              DT - Duplicate check timeout
    ("dupcheck_type", "name", "no", 20, 0),  #               DF:1 - Only do CRC checksum for filename.
    ("dupcheck_type", "content", "no", 20, 1),  #            DF:2 - Only do CRC checksum for file content.
    ("dupcheck_type", "name-content", "no", 20, 2),  #       DF:3 - Checksum for filename and content.
    ("dupcheck_type", "name-no-suffix", "no", 20, 3),  #     DF:4 - Checksum of filename without last suffix.
    ("dupcheck_type", "name-size", "no", 20, 4),  #          DF:5 - Checksum of filename and size.
    ("dupcheck_crc", "crc32", "no", 20, 15),  #              DF:16 - Do a CRC32 checksum.
    ("dupcheck_crc", "crc32c", "no", 20, 16),  #             DF:17 - Do a CRC32C checksum.
    ("dupcheck_delete", None, "no", 20, 23),  #              DF:24 - Delete the file.
    ("dupcheck_store", None, "no", 20, 24),  #               DF:25 - Store the duplicate file.
    ("dupcheck_warn", None, "no", 20, 25),  #                DF:26 - Warn in SYSTEM_LOG.
    ("dupcheck_timeout_fixed", None, "no", 20, 30),  #       DF:31 - Timeout is fixed, ie. not cumulative.
    ("dupcheck_reference", "recipient", "no", 20, 31),  #    DF:32 - Use full recipient as reference instead of alias name.
    ("keep_connected", None, "0", 21, -1),  #                KC - Keep connected
    ("warn_time", None, "0", 22, -1),  #                     WT - Warn time [secs]
)

HC_COMMENT = """#
#                Host configuration file for the AFD
#                ===================================
#
# There are 22 parameters that can be configured for each remote
# host. They are:
#
# Warn time               <-------------------------------------------------+
# Keep connected          <----------------------------------------------+  |
# Duplicate check flag    <-------------------------------------------+  |  |
# Duplicate check timeout <----------------------------------------+  |  |  |
# Socket receive buffer   <-------------------------------------+  |  |  |  |
# Socket send buffer      <---------------------------------+   |  |  |  |  |
#                                                           |   |  |  |  |  |
# AH:HN1:HN2:HT:PXY:AT:ME:RI:TB:SR:FSO:TT:NB:HS:SF:TRL:TTL:SSB:SRB:DT:DF:KC:WT
# |   |   |   |  |  |  |  |  |  |   |  |  |  |  |   |   |
# |   |   |   |  |  |  |  |  |  |   |  |  |  |  |   |   +-> TTL
# |   |   |   |  |  |  |  |  |  |   |  |  |  |  |   +-----> Transfer rate limit
# |   |   |   |  |  |  |  |  |  |   |  |  |  |  +---------> Protocol options
# |   |   |   |  |  |  |  |  |  |   |  |  |  +------------> Host status
# |   |   |   |  |  |  |  |  |  |   |  |  +---------------> Number of no bursts
# |   |   |   |  |  |  |  |  |  |   |  +------------------> Transfer timeout
# |   |   |   |  |  |  |  |  |  |   +---------------------> File size offset
# |   |   |   |  |  |  |  |  |  +-------------------------> Successful retries
# |   |   |   |  |  |  |  |  +----------------------------> Transfer block size
# |   |   |   |  |  |  |  +-------------------------------> Retry interval
# |   |   |   |  |  |  +----------------------------------> Max. errors
# |   |   |   |  |  +-------------------------------------> Allowed transfers
# |   |   |   |  +----------------------------------------> Proxy name
# |   |   |   +-------------------------------------------> Host toggle
# |   |   +-----------------------------------------------> Real hostname 2
# |   +---------------------------------------------------> Real hostname 1
# +-------------------------------------------------------> Alias hostname
#
# Or if you prefer another view of the above:
#
#   <Alias hostname>:<Real hostname 1>:<Real hostname 2>:<Host toggle>:
#   <Proxy name>:<Allowed transfers>:<Max. errors>:<Retry interval>:
#   <Transfer block size>:<Successful retries>:<File size offset>:
#   <Transfer timeout>:<no bursts>:<host status>:<special flag>:
#   <transfer rate limit>:<TTL>:<Socket send buffer>:<Socket receive buffer>:
#   <dupcheck timeout>:<dupcheck flag>:<Keep connected>:<Warn time>
#
# The meaning of each is outlined in more detail below:
#
# Alias hostname         - This is the host name that is being displayed in the
#                          afd_ctrl window and is used in the log files. It may
#                          only be 8 (MAX_HOSTNAME_LENGTH) characters long.
#                          DEFAULT: None (Empty)
# Real hostname 1        - The real host name or IP number of the primary host.
# Real hostname 2        - The real host name or IP number of the secondary
#                          host.
# Host toggle            - Host switching information. This string holds the
#                          toggling character to be displayed for the
#                          primary and secondary host. The two characters
#                          must be put in either curly brackets {} for
#                          automatic host switching or square brackets []
#                          host switching by the user.
# Proxy name             - If the remote host can only be reached via a
#                          proxy, specify the name of the proxy here.
#                          DEFAULT: None (Empty)
# Allowed transfers      - The maximum number of parallel transfers for this
#                          host.
#                          DEFAULT: 2
# Max. errors            - If max. errors is reached the destination identifier
#                          turns 'red'. If error retries reaches twice max.
#                          errors the queue of this host will be paused.
# Retry interval         - If an error occurs, this is the delay (in
#                          seconds) before another transfer is initiated.
# Transfer block size    - The size of the blocks being used to send files
#                          to the remote host (in bytes).
#                          DEFAULT: 4096
# Successful retries     - This is only used when there is a secondary host
#                          and automatic switch over is active. It is the
#                          number of successful transfers to the secondary
#                          host, before it tries to switch back to the main
#                          host to see if it is alive again.
# File size offset       - When transmitting large files and the transfer gets
#                          interrupted, the AFD can append a file on the remote
#                          site. For this it needs to know the file size on
#                          the remote site. And to get the size it does a dir
#                          'filename' at the remote site. Due to different
#                          replies of the FTP servers, the position of the
#                          file size is needed. You can easily determine this
#                          value simply doing an FTP to the remote site and
#                          a dir and count the spaces to the file size. For
#                          example:
#
#             -rw-r--r--   1 afd      mts-soft   14971 Jan  3 17:16
#                       ^^^ ^   ^^^^^^        ^^^
#                        |  |     |            |
#                        |  |     |            |
#                        1  2     3            4
#
#                          You may also put a -2 here, then AFD will try to use
#                          the FTP SIZE command to get the size of the remote
#                          file.
#                          DEFAULT: -1 (Disabled)
#
# Transfer timeout       - The time how long the AFD should wait for a reply
#                          from the remote site.
#                          DEFAULT: 120
# Number of no bursts    - This option applies only to FTP transfers. A burst
#                          is when a new job is appended to a transferring
#                          job. It can happen that jobs get constantly appended
#                          while other jobs with a higher priority have to wait.
#                          Therefor it is possible to state the number of
#                          connections that may NOT burst.
#                          DEFAULT: 0
# Host status            - This indicates the status of the host, currently
#                          only bits number 1, 2, 3, 6 and 7 can be set. The
#                          meaning is as follows (the values in brackets
#                          are the integer values that may be set):
#                          1 (1)     - If set transfer is stopped for this host.
#                          2 (2)     - If set queue is stopped for this host.
#                          3 (4)     - If set host is NOT in DIR_CONFIG.
#                          5 (16)    - Error status offline.
#                          6 (32)    - If set this host is disabled.
#                          7 (64)    - If set and host switching is used
#                                      this tells that host two is active.
#                          16(32768) - If set do not delete files due to
#                                      age-limit and 'delete queued files'
#                                      option.
#                          DEFAULT: 0
# Protocol options       - To set some protocol specific features for this
#                          host. The following bits can be set (again the
#                          values in bracket are the integer values that can
#                          be set):
#                          1 (1)       - FTP passive mode
#                          2 (2)       - Set FTP idle time to transfer timeout
#                          3 (4)       - Send STAT command to keep control
#                                        connection alive.
#                          4 (8)       - Combine RNFR and RNTO to one command.
#                          5 (16)      - Do not do a cd, always use absolute path.
#                          6 (32)      - Do not send TYPE I command.
#                          7 (64)      - Use extended active or extended passive
#                                        mode.
#                          8 (128)     - If set bursting is disabled.
#                          9 (256)     - If set FTP passive mode allows to be
#                                        redirected to another address.
#                          10(512)     - When set it will replace the given scheme
#                                        with file if the hostname matches local
#                                        hostname or one in local_interface.list.
#                          11(1024)    - Set TCP keepalive.
#                          12(2048)    - Set sequence locking.
#                          13(4096)    - Enable compression.
#                          14(8192)    - Keep time stamp of source file.
#                          15(16384)   - Sort file names.
#                          16(32768)   - No ageing jobs.
#                          17(65536)   - Check if local and remote size match.
#                          18(131072)  - Timeout transfer.
#                          19(262144)  - Keep connected no fetching.
#                          20(524288)  - Keep connected no sending.
#                          21(1048576) - FTPS Clear Control Connection.
#                          22(2097152) - Use FTP LIST for directory listing.
#                          23(4194304) - TLS uses strict verification of host.
#                          24(8388608) - Disables FTP MLST for directory listing.
#                          25(16777216)- Disconnect after given keep connected time.
#                          DEFAULT: 0
# Transfer rate limit    - The maximum number of kilobytes that may be
#                          transfered per second.
#                          DEFAULT: 0 (Disabled)
# TTL                    - The time-to-live for outgoing multicasts.
# Socket send buffer     - How large the socket send buffer should be in
#                          bytes. If this is zero it will leave it unchanged
#                          ie. it will leave the system default.
#                          DEFAULT: 0
# Socket receive buffer  - How large the socket receive buffer should be in
#                          bytes. If this is zero it will leave it unchanged
#                          ie. it will leave the system default.
#                          DEFAULT: 0
# Duplicate check timeout- Check for duplicates if the value is bigger then 0.
#                          The unit is seconds and is the time how long the
#                          CRC is to be stored.
#                          DEFAULT: 0 (Disabled)
# Duplicate check flag   - This flag specifies how to determine the checksum,
#                          which CRC to use and what action should be taken
#                          when we find a duplicate. The bits have the
#                          following meaning:
#                          1 (1)          - Only do CRC checksum for filename.
#                          2 (2)          - Only do CRC checksum for file
#                                           content.
#                          3 (4)          - Checksum for filename and content.
#                          4 (8)          - Checksum of filename without last
#                                           suffix.
#                          5 (16)         - Checksum of filename and size.
#                          16(32768)      - Do a CRC32 checksum.
#                          17(65536)      - Do a CRC32C checksum.
#                          24(8388608)    - Delete the file.
#                          25(16777216)   - Store the duplicate file.
#                          26(33554432)   - Warn in SYSTEM_LOG.
#                          31(1073741824) - Timeout is fixed, ie. not
#                                           cumulative.
#                          32(2147483648) - Use full recipient as reference
#                                           instead of alias name.
#                          DEFAULT: 0
# Keep connected         - Keep connection for the given number of seconds
#                          after all files have been transmitted or some
#                          data was retrieved.
#                          DEFAULT: 0
# Warn time              - When the given time in seconds have elapsed with no
#                          data being send to this host, the script/program in
#                          $AFD_WORK_DIR/etc/action/target/warn/ with the
#                          <Alias hostname> as filename is executed with the
#                          parameter 'start'. As soon as data has been send
#                          successful the script/program is called again with
#                          the parameter 'stop'.
#                          DEFAULT: 0
#
# Example entry:
#  idefix:192.168.1.24:192.168.1.25:[12]::5:10:300:4096:10:-2:20:0:0:0:0:0:0:0:0:0:0:0

"""

PROTO_SCHEME = {
    "FTP": ".scheme-remote.scheme-ftp",
    "SFTP": ".scheme-remote.scheme-sftp",
    "SCP": ".scheme-remote.scheme-sftp",
    "HTTP": ".scheme-remote",
    "SMTP": ".scheme-remote",
    "FILE": ".scheme-local",
    "LOC": ".scheme-local",
    "WMO": ".scheme-remote",
    "EXEC": ".scheme-local",
    None: "",
}


def read_hostconfig(afd_work_dir, alias=None):
    hc_order = []
    hc_data = {}

    def int_or_str(s):
        try:
            return int(s)
        except:
            return s

    def get_proto(host):
        try:
            if host is None:
                host = ""
            line = check_output("fsa_view {} | grep Protocol".format(host),
                                encoding="latin-1",
                                shell=True)
            return line.split(":")[1].strip().split(" ")[0]
        except:
            return None

    with open(os.path.join(afd_work_dir, "etc", "HOST_CONFIG"), "rt") as fh_hc:
        for line in fh_hc:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line_data = line.split(":")
            hc_order.append(line_data[HC_FIELD_NAME])
            if alias is None or line_data[HC_FIELD_NAME] == alias:
                hc_data[line_data[HC_FIELD_NAME]] = {}
                hc_data[line_data[HC_FIELD_NAME]]["protocol-class"] = PROTO_SCHEME[get_proto(alias)]
                for hc_field in HC_FIELDS:
                    if hc_field[HC_FIELD_BIT] >= 0:
                        if int(line_data[hc_field[HC_FIELD_COLUMN]]) & (1 << hc_field[HC_FIELD_BIT]):
                            value = hc_field[HC_FIELD_RADIO] or "yes"
                        else:
                            value = "no"
                    elif hc_field[HC_FIELD_BIT] == -2:
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
                    if (
                        hc_field[HC_FIELD_NAME]
                            not in hc_data[line_data[HC_FIELD_NAME]]
                        or hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]]
                            in ("no", hc_field[HC_FIELD_DEFAULT])
                    ):
                        hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]] = int_or_str(value)
    return {"order":hc_order, "data":hc_data}


def save_hostconfig(afd_work_dir, form_json):
    tmp_fn_hc = os.path.join(afd_work_dir, "etc", ".HOST_CONFIG")
    # Read current content of HOST_CONFIG
    hc = read_hostconfig(afd_work_dir)
    # Replace the host order
    hc["order"] = form_json["order"]
    if "data" in form_json:
        # Update values for all submitted host with those from the request.json
        for alias, alias_data in form_json["data"].items():
            hc["data"][alias] = {t[HC_FIELD_NAME]:t[HC_FIELD_RADIO] or t[HC_FIELD_DEFAULT] for t in HC_FIELDS}
            hc["data"][alias].update(alias_data)
    with open(tmp_fn_hc, "wt") as fh_hc:
        # Write a new HOST_CONFIG to a temporary file.
        fh_hc.write(HC_COMMENT)
        for alias in hc["order"]:
            line_data = [None] * 23
            hc_toggle = {}
            for tuplevalue_field, tuplevalue_radio, tuplevalue_default, tuplevalue_column, tuplevalue_bit in HC_FIELDS:
                if tuplevalue_bit >= 0:
                    column_value = line_data[tuplevalue_column]
                    if column_value is None:
                        column_value = 0
                    if isinstance(column_value, str):
                        column_value = int(column_value)
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
                    line_data[3] = "{{{host_switch_char1}{host_switch_char2}}}".format(**hc_toggle)
                else:
                    line_data[3] = "[{host_switch_char1}{host_switch_char2}]".format(**hc_toggle)
            else:
                line_data[3] = ""
            fh_hc.write(":".join(str(x) for x in line_data))
            fh_hc.write("\n")
    os.rename(tmp_fn_hc, os.path.join(afd_work_dir, "etc", "HOST_CONFIG"))

