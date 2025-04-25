import sys
import os
import subprocess
from PyQt5.QtWidgets import (QApplication, QWidget, QLabel, QPushButton,
                             QVBoxLayout, QFileDialog, QComboBox, QTextEdit, QMessageBox)
from PyQt5.QtCore import QProcess
import serial.tools.list_ports

class ESP32QtFlasher(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ESP32 Flasher (Qt Edition)")
        self.resize(600, 400)

        self.firmware_path = None
        self.spiffs_path = None

        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        self.port_label = QLabel("Select Serial Port:")
        layout.addWidget(self.port_label)

        self.port_combo = QComboBox()
        self.refresh_ports()
        layout.addWidget(self.port_combo)

        self.refresh_btn = QPushButton("Refresh Ports")
        self.refresh_btn.clicked.connect(self.refresh_ports)
        layout.addWidget(self.refresh_btn)

        self.fw_btn = QPushButton("Choose firmware.bin (0x10000)")
        self.fw_btn.clicked.connect(self.choose_firmware)
        layout.addWidget(self.fw_btn)

        self.spiffs_btn = QPushButton("Choose spiffs.bin (0x3D0000)")
        self.spiffs_btn.clicked.connect(self.choose_spiffs)
        layout.addWidget(self.spiffs_btn)

        self.flash_btn = QPushButton("Flash ESP32")
        self.flash_btn.clicked.connect(self.flash_device)
        layout.addWidget(self.flash_btn)

        self.output = QTextEdit()
        self.output.setReadOnly(True)
        layout.addWidget(self.output)

        self.setLayout(layout)

    def refresh_ports(self):
        self.port_combo.clear()
        ports = [port.device for port in serial.tools.list_ports.comports()]
        self.port_combo.addItems(ports)

    def choose_firmware(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select firmware.bin", "", "BIN Files (*.bin)")
        if path:
            self.firmware_path = path
            self.output.append(f"✅ Firmware selected: {path}")

    def choose_spiffs(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select spiffs.bin", "", "BIN Files (*.bin)")
        if path:
            self.spiffs_path = path
            self.output.append(f"✅ SPIFFS selected: {path}")

    def flash_device(self):
        port = self.port_combo.currentText()

        if not port:
            QMessageBox.critical(self, "Error", "Please select a serial port.")
            return

        if not self.firmware_path or not os.path.exists(self.firmware_path):
            QMessageBox.critical(self, "Error", "Please select a valid firmware.bin file.")
            return

        if not self.spiffs_path or not os.path.exists(self.spiffs_path):
            QMessageBox.critical(self, "Error", "Please select a valid spiffs.bin file.")
            return

        cmds = [
            ["esptool.py", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0x10000", self.firmware_path],
            ["esptool.py", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0x3D0000", self.spiffs_path]
        ]

        for cmd in cmds:
            self.output.append(f"\n🚀 Running: {' '.join(cmd)}")
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                for line in proc.stdout:
                    decoded = line.decode(errors='ignore')
                    self.output.append(decoded.strip())
                proc.wait()
            except Exception as e:
                self.output.append(f"❌ Error: {e}")
        self.output.append("\n✅ Flashing complete!")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    flasher = ESP32QtFlasher()
    flasher.show()
    sys.exit(app.exec_())
