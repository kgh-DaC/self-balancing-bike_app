#define    STX          0x02
#define    ETX          0x03
byte cmd[8] = {0, 0, 0, 0, 0, 0, 0, 0};
byte buttonStatus = 0; 

unsigned long lastCmdMs = 0;                 // time of last valid frame (failsafe)
const unsigned long CMD_TIMEOUT = 500;        // ms without a valid frame -> stop steering/speed
int lastJoyX = 999, lastJoyY = 999;           // for change-only debug echo

void readControlParameters() {
  if (Serial.available())  {                           // data received from smartphone
    cmd[0] =  Serial.read();  
    if(cmd[0] == STX)  {
      int i = 1;
      bool complete = false;
      while (Serial.available())  {
        cmd[i] = Serial.read();
        if(cmd[i] > 127)                          break;     // Communication error
        if((cmd[i] == ETX) && (i == 2 || i == 7)) { complete = true; break; }  // Button or Joystick data
        i++;
        if(i > 7)                                 break;     // frame too long (never write past cmd[7])
      }
      if (complete && i == 2) { getButtonState(cmd[1]); lastCmdMs = millis(); }   // 3 Bytes  ex: < STX "C" ETX >
      else if (complete && i == 7) getJoystickState(cmd);                         // 8 Bytes  ex: < STX "200" "180" ETX >
    }
  }
  if (millis() - lastCmdMs > CMD_TIMEOUT) {            // failsafe: link lost -> neutral
    steering_remote = 0;
    speed_remote = 0;
  }
}

void getJoystickState (byte data[8])    {
  int joyX = (data[1] - 48) * 100 + (data[2] - 48) * 10 + (data[3] - 48);   // obtain the Int from the ASCII representation
  int joyY = (data[4] - 48) * 100 + (data[5] - 48) * 10 + (data[6] - 48);
  joyX = joyX - 200;                                                        // Offset to avoid
  joyY = joyY - 200;                                                        // transmitting negative numbers

  if (joyX < -100 || joyX > 100 || joyY < -100 || joyY > 100) return;       // commmunication error
  lastCmdMs = millis();
  if (joyX != lastJoyX || joyY != lastJoyY) {                               // debug echo: confirms the frame arrived
    lastJoyX = joyX; lastJoyY = joyY;
    Serial.print("J "); Serial.print(joyX); Serial.print(" "); Serial.println(joyY);
  }
  if (joyX < - 10 || joyX > 10)  { // dead zone
    if (joyX > 0) // exponential
      steering_remote = (-joyX * joyX + 0.1 * joyX) / 100.0;
    else   
      steering_remote = (joyX * joyX + 0.1 * joyX) / 100.0;
  } else 
      steering_remote = 0;
  steering_remote = -map(steering_remote, -100, 100, -STEERING_MAX, STEERING_MAX);
  if (joyY < - 10 || joyY > 10)  // dead zone 
     speed_remote = map(joyY, 100, -100, SPEED_MAX, -SPEED_MAX);
  else
     speed_remote = 0;        
}

void getButtonState (int bStatus)  {
  switch (bStatus) {
// -----------------  BUTTON #1  -----------------------
   case 'A':
      buttonStatus |= B000001;        // ON
      break;
    case 'B':
      buttonStatus &= B111110;        // OFF
      break;
// -----------------  BUTTON #2  -----------------------
   case 'C':
      buttonStatus |= B000010;        // ON    
      break;
    case 'D':
      buttonStatus &= B111101;        // OFF    
      break;
    case 'S':
      Serial.println(calibrated ? "Read calibration data!" : "Has no calibration data!");
      break;
  }
}

String getButtonStatusString()  {
  String bStatus = "";
  for (int i = 0; i < 6; i++)  {
    if (buttonStatus & (B100000 >> i))      bStatus += "1";
    else                                    bStatus += "0";
  }
  return bStatus;
}

void sendControlParameters() {
  Serial.print((char)STX);                                                // Start of Transmission
  Serial.print(getButtonStatusString());  Serial.print((char)0x1);        // buttons status feedback
  Serial.print(0);                        Serial.print((char)0x4);        // datafield #1
  Serial.print(0);                        Serial.print((char)0x5);        // datafield #2
  Serial.print(0);                                                        // datafield #3
  Serial.print((char)ETX);                                                // End of Transmission
}
