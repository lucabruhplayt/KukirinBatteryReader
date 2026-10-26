import React, { useState, useRef } from 'react';
import { decodeScooterPacket } from './scooterDecoder';
import './App.css';

export default function App() {
  const [isSupported] = useState(() => Boolean(navigator.bluetooth));
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [statusMessage, setStatusMessage] = useState(() => 
    navigator.bluetooth ? 'Disconnected' : 'Web Bluetooth API is not supported on this browser/device.'
  );
  const [activeCharacteristicUuid, setActiveCharacteristicUuid] = useState(null);

  // Telemetry state
  const [speed, setSpeed] = useState(null);
  const [voltage, setVoltage] = useState(null);
  const [rawLog, setRawLog] = useState([]);

  // Refs to hold active characteristic listeners/notifications for cleanup
  const activeCharacteristicsRef = useRef([]);

  // Handle disconnection event
  const handleDisconnection = () => {
    console.warn('[BLE] Scooter disconnected');
    setIsConnected(false);
    setActiveCharacteristicUuid(null);
    setStatusMessage('Disconnected from scooter');
    setSpeed(null);
    setVoltage(null);
    
    // Clear active characteristics refs
    activeCharacteristicsRef.current = [];
  };

  const connectScooter = async () => {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is not supported on this browser.');
      return;
    }

    try {
      setStatusMessage('Scanning for KuKirin G2...');
      console.log('[BLE] Requesting Bluetooth Device...');

      // Request device with service FFF0 or name prefix/filters
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [0xfff0] },
          { namePrefix: 'KuKirin' },
          { namePrefix: 'G2' },
          { namePrefix: 'KK' },
          { namePrefix: 'SCOOTER' }
        ],
        optionalServices: [0xfff0]
      });

      setDevice(selectedDevice);
      setStatusMessage(`Connecting to ${selectedDevice.name || 'Scooter'}...`);
      console.log(`[BLE] Connecting to GATT server of ${selectedDevice.name}...`, selectedDevice.id);

      selectedDevice.addEventListener('gattserverdisconnected', handleDisconnection);

      const gattServer = await selectedDevice.gatt.connect();
      setServer(gattServer);
      console.log('[BLE] Connected to GATT Server');

      setStatusMessage('Discovering services (FFF0)...');
      
      // Get primary service FFF0
      let service;
      try {
        service = await gattServer.getPrimaryService(0xfff0);
        console.log('[BLE] Primary service FFF0 discovered');
      } catch (err) {
        console.error('[BLE] Service FFF0 not found:', err);
        throw new Error('Required service FFF0 not found on scooter.');
      }

      // Discover characteristics: FFF1 and FFF2 (FFF3 is not present)
      setStatusMessage('Discovering characteristics...');
      const targetUuids = [0xfff1, 0xfff2];
      let subscribedCount = 0;

      for (const uuid of targetUuids) {
        try {
          const characteristic = await service.getCharacteristic(uuid);
          console.log(`[BLE] Found characteristic: 0x${uuid.toString(16).toUpperCase()}`);
          console.log(`[BLE] Properties for 0x${uuid.toString(16).toUpperCase()}:`, {
            broadcast: characteristic.properties.broadcast,
            read: characteristic.properties.read,
            writeWithoutResponse: characteristic.properties.writeWithoutResponse,
            write: characteristic.properties.write,
            notify: characteristic.properties.notify,
            indicate: characteristic.properties.indicate,
          });

          // Check if notifications are supported
          if (characteristic.properties.notify || characteristic.properties.indicate) {
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
              const value = event.target.value;
              const uuidStr = `0x${uuid.toString(16).toUpperCase()}`;
              setActiveCharacteristicUuid(uuidStr);

              // Decode using external decoder module
              const decoded = decodeScooterPacket(value, uuidStr);
              
              // Keep rolling log of last 20 raw packets for debugging
              setRawLog(prev => [{
                time: new Date().toLocaleTimeString(),
                char: uuidStr,
                hex: decoded.hex
              }, ...prev.slice(0, 19)]);

              if (decoded.speed !== null) setSpeed(decoded.speed);
              if (decoded.voltage !== null) setVoltage(decoded.voltage);
            });

            activeCharacteristicsRef.current.push(characteristic);
            subscribedCount++;
            console.log(`[BLE] Subscribed to notifications on 0x${uuid.toString(16).toUpperCase()}`);
          } else if (characteristic.properties.read) {
            // Read initial value if notify is not available
            const value = await characteristic.readValue();
            const uuidStr = `0x${uuid.toString(16).toUpperCase()}`;
            const decoded = decodeScooterPacket(value, uuidStr);
            if (decoded.speed !== null) setSpeed(decoded.speed);
            if (decoded.voltage !== null) setVoltage(decoded.voltage);
          }
        } catch (charErr) {
          console.warn(`[BLE] Characteristic 0x${uuid.toString(16).toUpperCase()} not available or accessible:`, charErr);
        }
      }

      if (subscribedCount === 0) {
        console.warn('[BLE] Warning: No notification characteristics could be subscribed under FFF0.');
      }

      // BLE connection succeeds
      setIsConnected(true);
      setStatusMessage('Connected');
      console.log('[BLE] Successfully connected and initialized scooter telemetry stream.');

    } catch (error) {
      console.error('[BLE Connection Error]:', error);
      setStatusMessage(`Connection failed: ${error.message || error}`);
      setIsConnected(false);
      if (device && device.gatt.connected) {
        device.gatt.disconnect();
      }
    }
  };

  const disconnectScooter = () => {
    if (device && device.gatt.connected) {
      device.gatt.disconnect();
    }
    handleDisconnection();
  };

  return (
    <div className="scooter-app">
      <header className="app-header">
        <div className="brand">
          <h1>KuKirin G2</h1>
          <span className="subtitle">Telemetry Dashboard</span>
        </div>
        <div className="connection-pill">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">{statusMessage}</span>
        </div>
      </header>

      {!isSupported ? (
        <div className="card error-card">
          <h2>Browser Not Supported</h2>
          <p>
            Web Bluetooth API is not supported by your browser or device.
          </p>
          <p className="note">
            <strong>iOS Users:</strong> Apple's iOS Safari does not support Web Bluetooth. Please use an Android device with Chrome, or a desktop browser (Chrome/Edge/Opera) with Bluetooth enabled.
          </p>
        </div>
      ) : (
        <main className="dashboard-main">
          {/* Connection Control Section */}
          <div className="control-section">
            {!isConnected ? (
              <button className="btn-connect" onClick={connectScooter}>
                Connect Scooter
              </button>
            ) : (
              <button className="btn-disconnect" onClick={disconnectScooter}>
                Disconnect Scooter
              </button>
            )}
            {activeCharacteristicUuid && (
              <div className="active-char-info">
                Active RX: <code>{activeCharacteristicUuid}</code>
              </div>
            )}
          </div>

          {/* Telemetry Display Cards (Only Speed and Voltage) */}
          <div className="telemetry-grid">
            <div className="telemetry-card">
              <div className="card-label">Speed</div>
              <div className="card-value-container">
                <span className="card-value">
                  {speed !== null ? speed.toFixed(1) : 'Waiting for data'}
                </span>
                {speed !== null && <span className="card-unit">km/h</span>}
              </div>
            </div>

            <div className="telemetry-card">
              <div className="card-label">Battery Voltage</div>
              <div className="card-value-container">
                <span className="card-value">
                  {voltage !== null ? voltage.toFixed(1) : 'Waiting for data'}
                </span>
                {voltage !== null && <span className="card-unit">V</span>}
              </div>
            </div>
          </div>

          {/* Development Raw Log Inspector */}
          {isConnected && (
            <div className="debug-log-card">
              <h3>Live BLE Packet Inspector (Console Logged)</h3>
              <div className="log-scroll">
                {rawLog.length === 0 ? (
                  <p className="no-logs">Listening for incoming BLE notifications...</p>
                ) : (
                  rawLog.map((log, idx) => (
                    <div key={idx} className="log-entry">
                      <span className="log-time">[{log.time}]</span>
                      <span className="log-char">{log.char}:</span>
                      <span className="log-hex">{log.hex}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="app-footer">
        <p>KuKirin G2 2025 • Direct BLE GATT Client</p>
      </footer>
    </div>
  );
}
