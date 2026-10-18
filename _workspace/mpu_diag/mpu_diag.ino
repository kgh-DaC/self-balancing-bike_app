#include <Wire.h>
#define MPU 0x68

int16_t rd16(uint8_t reg, bool &ok) {
  Wire.beginTransmission(MPU); Wire.write(reg);
  if (Wire.endTransmission(false) != 0) { ok = false; return 0; }
  if (Wire.requestFrom(MPU, 2, true) != 2) { ok = false; return 0; }
  return (Wire.read() << 8) | Wire.read();
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
  delay(100);
  Wire.beginTransmission(MPU); Wire.write(0x6B); Wire.write(0); uint8_t e = Wire.endTransmission();
  Serial.print("wake err="); Serial.println(e);              // 0 = sensor ACKed
  Wire.beginTransmission(MPU); Wire.write(0x75); Wire.endTransmission(false);
  Wire.requestFrom(MPU, 1, true);
  Serial.print("WHO_AM_I=0x"); Serial.println(Wire.available() ? Wire.read() : -1, HEX);  // 0x68 expected
  Serial.println("ax,ay,az,gx,gy,gz,err");
}

void loop() {
  bool ok = true;
  int16_t ax = rd16(0x3B, ok), ay = rd16(0x3D, ok), az = rd16(0x3F, ok);
  int16_t gx = rd16(0x43, ok), gy = rd16(0x45, ok), gz = rd16(0x47, ok);
  Serial.print(ax); Serial.print(','); Serial.print(ay); Serial.print(','); Serial.print(az); Serial.print(',');
  Serial.print(gx); Serial.print(','); Serial.print(gy); Serial.print(','); Serial.print(gz); Serial.print(',');
  Serial.println(ok ? 0 : 1);
  delay(100);
}
