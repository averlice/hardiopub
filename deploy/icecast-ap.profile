# Firejail profile for the dedicated AudioPub Icecast instance (port 8001)
# Loopback-only. icecast drops to the icecast-ap user via its own <changeowner>,
# so we must NOT use noroot (it would block the setuid). caps.drop all +
# seccomp still strip everything else.
seccomp
nosound
nodbus
nodvd
nogroups
no3d
private-tmp
private-dev
netfilter icecast-ap.netfilter
protocol unix,inet
read-only /usr/share/icecast2
read-only /etc/icecast-ap
whitelist /var/log/icecast-ap
whitelist /var/lib/icecast-ap
