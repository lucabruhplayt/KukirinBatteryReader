# KuKirin G2 2025 BLE Dashboard

A minimal, mobile-friendly web application built with React, Vite, and Plain CSS to connect directly to the **KuKirin G2 2025** electric scooter over Bluetooth Low Energy (BLE).

---

## Features

- **Web Bluetooth Integration**: Scans for and connects directly to the scooter's GATT server using service `FFF0` and characteristics `FFF1` & `FFF2` (with built-in handling for the absence of `FFF3`).
- **Telemetry Display**: Displays **Speed (km/h)** and **Battery Voltage (V)** in clean, modern dark cards. Shows `"Waiting for data"` until evidence-backed packets arrive.
- **Evidence-Based Decoding**: All packet parsing is isolated in `src/scooterDecoder.js` with full console logging (`[BLE Data]`) for capturing raw byte structures.
- **Mobile Responsive & Cross-Platform Safe**: Designed for Android Chrome. Gracefully handles iOS Safari with a clear explanation of Web Bluetooth limitations on iOS.

---

## Setup & Installation Instructions

### Prerequisites
- Node.js (v18+ recommended) installed on your computer.

### 1. Install Dependencies
Open your terminal in the project directory and run:
```bash
npm install
```

### 2. Run Development Server
Start the local Vite development server:
```bash
npm run dev
```
By default, this serves locally at `http://localhost:5173`. The Vite configuration (`vite.config.js`) has `host: true` enabled so you can easily access it from your mobile device on the same Wi-Fi network.

---

## Serving over HTTPS for Mobile Bluetooth Access

Web Bluetooth **strictly requires a Secure Context (HTTPS or localhost)** to function on mobile devices and modern desktop browsers. While `localhost` works on desktop and Android USB debugging, testing from an Android mobile device over Wi-Fi requires HTTPS.

Here are the easiest ways to serve your site over HTTPS for mobile testing:

### Option A: Using Vite with a self-signed HTTPS plugin (or Vite Preview with proxy)
You can use `vite-plugin-mkcert` or access via local tunneling tools:

### Option B: Using `ngrok` (Recommended & Easiest)
1. Start your local dev server:
   ```bash
   npm run dev
   ```
2. In a separate terminal window, tunnel your local port using `ngrok`:
   ```bash
   ngrok http 5173
   ```
3. Copy the provided `https://xxxx.ngrok-free.app` URL and open it in Chrome on your Android mobile device. Bluetooth scanning will work fully over this HTTPS connection!

---

## Bluetooth & Protocol Notes
- **UUIDs**: Service `0xFFF0`, Characteristics `0xFFF1`, `0xFFF2`.
- **Packet Investigation**: Incoming packets are logged in the browser developer console and the on-screen live packet inspector. Update `src/scooterDecoder.js` once you have captured and analyzed the raw byte structures from your specific scooter.
