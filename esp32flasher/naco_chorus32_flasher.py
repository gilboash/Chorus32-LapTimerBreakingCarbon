
import sys
import os
import subprocess
import importlib.util
from PyQt5.QtWidgets import (QApplication, QWidget, QLabel, QPushButton,
                             QVBoxLayout, QFileDialog, QComboBox, QTextEdit, QMessageBox)
from PyQt5.QtGui import QPalette, QColor
from PyQt5.QtGui import QPixmap
from PyQt5.QtCore import Qt
import serial.tools.list_ports

class ESP32QtMultiFlasher(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Naco Chorus32 Lap Timer Flasher")
        self.resize(600, 600)

        palette = self.palette()
        palette.setColor(QPalette.Window, QColor(255, 192, 203))  # Light pink background
        palette.setColor(QPalette.WindowText, QColor(0, 0, 0))    # Black text
        palette.setColor(QPalette.ButtonText, QColor(0, 0, 0))    # Black button text
        self.setPalette(palette)

        self.bootloader_path = None
        self.partitions_path = None
        self.ota_data_path = None
        self.firmware_path = None
        self.spiffs_path = None
        self.python_cmd = sys.executable

        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        logo_label = QLabel()
        pixmap = QPixmap("breaking_carbon.png")
        pixmap = pixmap.scaledToWidth(200)
        logo_label.setPixmap(pixmap)
        logo_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(logo_label)

        self.port_label = QLabel("Select Serial Port:")
        layout.addWidget(self.port_label)

        self.port_combo = QComboBox()
        self.refresh_ports()
        layout.addWidget(self.port_combo)

        self.refresh_btn = QPushButton("Refresh Ports")
        self.refresh_btn.clicked.connect(self.refresh_ports)
        layout.addWidget(self.refresh_btn)

        self.boot_btn = QPushButton("Select bootloader.bin (optional @0x1000)")
        self.boot_btn.clicked.connect(self.choose_bootloader)
        layout.addWidget(self.boot_btn)

        self.partitions_btn = QPushButton("Select partitions.bin (optional @0x8000)")
        self.partitions_btn.clicked.connect(self.choose_partitions)
        layout.addWidget(self.partitions_btn)

        self.ota_btn = QPushButton("Select ota_data_initial.bin (optional @0xE000)")
        self.ota_btn.clicked.connect(self.choose_ota)
        layout.addWidget(self.ota_btn)

        self.fw_btn = QPushButton("Select firmware.bin (required @0x10000)")
        self.fw_btn.clicked.connect(self.choose_firmware)
        layout.addWidget(self.fw_btn)

        self.spiffs_btn = QPushButton("Select spiffs.bin (optional @0x3D0000)")
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

    def choose_bootloader(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select bootloader.bin", "", "BIN Files (*.bin)")
        if path:
            self.bootloader_path = path
            self.output.append(f"✅ Bootloader selected: {path}")

    def choose_partitions(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select partitions.bin", "", "BIN Files (*.bin)")
        if path:
            self.partitions_path = path
            self.output.append(f"✅ Partitions selected: {path}")

    def choose_ota(self):
        path, _ = QFileDialog.getOpenFileName(self, "Select ota_data_initial.bin", "", "BIN Files (*.bin)")
        if path:
            self.ota_data_path = path
            self.output.append(f"✅ OTA Data selected: {path}")

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

        try:
            subprocess.run([self.python_cmd, "-m", "esptool", "version"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError:
            QMessageBox.critical(self, "Error", "esptool module not found or not working. Please install it using pip.")
            return
        except FileNotFoundError:
            QMessageBox.critical(self, "Error", "Python executable not found. Please check Python installation.")
            return

        if not port:
            QMessageBox.critical(self, "Error", "Please select a serial port.")
            return

        if not self.firmware_path or not os.path.exists(self.firmware_path):
            QMessageBox.critical(self, "Error", "Please select a valid firmware.bin file.")
            return

        cmds = []

        if self.bootloader_path:
            cmds.append([self.python_cmd, "-m", "esptool", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0x1000", self.bootloader_path])

        if self.partitions_path:
            cmds.append([self.python_cmd, "-m", "esptool", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0x8000", self.partitions_path])

        if self.ota_data_path:
            cmds.append([self.python_cmd, "-m", "esptool", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0xe000", self.ota_data_path])

        cmds.append([self.python_cmd, "-m", "esptool", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0x10000", self.firmware_path])

        if self.spiffs_path:
            cmds.append([self.python_cmd, "-m", "esptool", "--chip", "esp32", "--port", port, "--baud", "115200", "--before", "no_reset", "write_flash", "0x3D0000", self.spiffs_path])

        for cmd in cmds:
            self.output.append(f"\n🚀 Running: {' '.join(cmd)}")
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1, universal_newlines=True)
                for line in iter(proc.stdout.readline, ''):
                    self.output.append(line.strip())
                    QApplication.processEvents()
                proc.stdout.close()
                proc.wait()
            except Exception as e:
                self.output.append(f"❌ Error: {e}")
        self.output.append("\n✅ Flashing complete!")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    flasher = ESP32QtMultiFlasher()
    flasher.show()
    sys.exit(app.exec_())
