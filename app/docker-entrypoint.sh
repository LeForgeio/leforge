#!/bin/sh
# =============================================================================
# LeForge Container Entrypoint
# =============================================================================
# Handles runtime configuration before starting supervisord:
# - MQTT password file generation (if credentials provided)
# - Other pre-startup configuration tasks
# =============================================================================

set -e

echo "[entrypoint] Starting LeForge container initialization..."

# =============================================================================
# MQTT Authentication Setup
# =============================================================================
MQTT_PASSWD_FILE="/etc/mosquitto/passwd"

if [ -n "$MQTT_USERNAME" ] && [ -n "$MQTT_PASSWORD" ]; then
    echo "[entrypoint] Configuring MQTT authentication..."
    
    # Create password file with provided credentials
    # mosquitto_passwd -b -c <file> <username> <password>
    mosquitto_passwd -b -c "$MQTT_PASSWD_FILE" "$MQTT_USERNAME" "$MQTT_PASSWORD"
    chown mosquitto:mosquitto "$MQTT_PASSWD_FILE"
    chmod 600 "$MQTT_PASSWD_FILE"
    
    # Update mosquitto config to use password file
    # Create a runtime config that includes authentication
    cat > /etc/mosquitto/mosquitto.runtime.conf << EOF
# Runtime-generated Mosquitto configuration with authentication
include_dir /etc/mosquitto/conf.d

# Include base configuration
# (pid_file, persistence, logging from mosquitto.conf)
pid_file /var/run/mosquitto/mosquitto.pid
persistence true
persistence_location /var/lib/mosquitto/
log_dest stdout
log_type error
log_type warning
log_type notice
log_timestamp true

# TCP Listener
listener 1883 0.0.0.0
protocol mqtt

# WebSocket Listener  
listener 9001 0.0.0.0
protocol websockets

# Authentication enabled
allow_anonymous false
password_file $MQTT_PASSWD_FILE

# Message Settings
max_packet_size 262144
max_inflight_messages 20
max_queued_messages 1000

# Client Settings
persistent_client_expiration 7d
allow_zero_length_clientid true
auto_id_prefix leforge-

# System Topic
sys_interval 10
EOF
    
    # Point mosquitto to use the runtime config
    export MQTT_CONFIG_FILE="/etc/mosquitto/mosquitto.runtime.conf"
    echo "[entrypoint] MQTT authentication configured for user: $MQTT_USERNAME"
else
    export MQTT_CONFIG_FILE="/etc/mosquitto/mosquitto.conf"
    echo "[entrypoint] MQTT running in anonymous mode (development)"
fi

# Export the config file path for supervisord
echo "MQTT_CONFIG_FILE=$MQTT_CONFIG_FILE" >> /etc/environment

# =============================================================================
# Start Supervisord
# =============================================================================
echo "[entrypoint] Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
