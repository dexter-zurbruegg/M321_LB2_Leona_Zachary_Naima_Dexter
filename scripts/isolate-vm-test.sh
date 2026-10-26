#!/bin/sh
# Only on the selected team VM, after a healthy 3-instance PostgreSQL check.
# A separate systemd timer restores connectivity even if SSH is lost.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run with sudo'; exit 1; }
case "$(hostname | tr A-Z a-z)" in m321-11-ap23a|m321-13-ap23a|m321-16-ap23a|m321-17-ap23a) ;; *) exit 1;; esac
restore=/home/ubuntu/m321-ha-20261024/restore-test-network.sh
cat > "$restore" <<'RESTORE'
#!/bin/sh
for chain in INPUT OUTPUT FORWARD; do
 while /usr/sbin/iptables -C "$chain" -j M321_HA_TEST 2>/dev/null; do /usr/sbin/iptables -D "$chain" -j M321_HA_TEST; done
done
/usr/sbin/iptables -F M321_HA_TEST 2>/dev/null || true
/usr/sbin/iptables -X M321_HA_TEST 2>/dev/null || true
RESTORE
chmod 700 "$restore"
iptables -L M321_HA_TEST >/dev/null 2>&1 && { echo 'Test chain already exists'; exit 1; }
systemd-run --unit=m321-ha-restore-$(date +%s) --on-active=120s --timer-property=AccuracySec=1s "$restore"
iptables -N M321_HA_TEST
iptables -A M321_HA_TEST -i lo -j RETURN
iptables -A M321_HA_TEST -o lo -j RETURN
iptables -A M321_HA_TEST -j DROP
# Run separately so the scheduling SSH command returns before isolation starts.
systemd-run --unit=m321-ha-isolate-$(date +%s) --on-active=3s --timer-property=AccuracySec=1s /bin/sh -c 'for chain in INPUT OUTPUT FORWARD; do /usr/sbin/iptables -I "$chain" 1 -j M321_HA_TEST; done'
echo 'Network isolation scheduled for 3 seconds from now; automatic restore in 120 seconds'
