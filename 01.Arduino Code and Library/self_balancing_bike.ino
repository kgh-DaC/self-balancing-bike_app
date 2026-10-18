#include <Wire.h>
#include <EEPROM.h>
#include <ServoTimer2.h>

#define PWM_1         9
#define DIR_1         7
#define PWM_2         10
#define DIR_2         5 

#define ENC_1         2
#define ENC_2         3

#define BRAKE         8
#define BUZZER        12
#define VBAT          A7

#define STEERING_MAX    350
#define SPEED_MAX       80
#define STEERING_CENTER 1500
#define ST_LIMIT        5
#define SPEED_LIMIT     4

//float Gyro_amount = 0.996;
float Gyro_amount = 0.896;

bool vertical = false;
bool calibrating = false;
bool calibrated = false;
bool PIDHas = false;

float K1 = 24.00;       //p
float K2 = -20.00;      //i
float K3 = -9.00;       //s
float K4 = -0.00;       //a

float loop_time = 10;

struct OffsetsObj {
  int ID;
  int16_t AcY;
  int16_t AcZ;
};
OffsetsObj offsets;

struct PidNum {
  int ID;
  float K1;
  float K2;
  float K3;
  float K4;
};
PidNum MyPid;

float alpha = 0.4; 

int16_t  AcY, AcZ, GyX, gyroX, gyroXfilt;

int16_t  AcYc, AcZc;
int16_t  GyX_offset = 0;
int32_t  GyX_offset_sum = 0;

float robot_angle;
float Acc_angle;

volatile byte pos;
volatile int motor_counter = 0, enc_count = 0;
int16_t motor_speed;
int32_t motor_pos;
int steering_remote = 0, speed_remote = 0, speed_value = 0, steering_value = STEERING_CENTER;;

int bat_divider = 58; // this value needs to be adjusted to measure the battery voltage correctly

long currentT, previousT_1, previousT_2 = 0;  

ServoTimer2 steering_servo;
ServoTimer2 steering_servo2;

void setup() {
  Serial.begin(115200);                       //串口初始化

  // Pins D9 and D10 - 7.8 kHz
  TCCR1A = 0b00000001;                        //9脚10脚PWM设置
  TCCR1B = 0b00001010;                        //9脚10脚PWM设置

  steering_servo.attach(A3);                  //舵机引脚定义
  steering_servo.write(STEERING_CENTER);      //舵机回中 

  steering_servo2.attach(10);                  //舵机引脚定义
  steering_servo2.write(STEERING_CENTER);      //舵机回中 

  pinMode(DIR_1, OUTPUT);                     //方向1引脚模式定义
  pinMode(DIR_2, OUTPUT);                     //方向2引脚模式定义
  pinMode(BRAKE, OUTPUT);                     //刹车引脚模式定义
  pinMode(BUZZER, OUTPUT);                    //蜂鸣器引脚模式定义
  pinMode(ENC_1, INPUT);                      //编码器A引脚模式定义
  pinMode(ENC_2, INPUT);                      //编码器B引脚模式定义
  
  Motor1_control(0);                          //电机1调速设置为0
  Motor2_control(0);                          //电机2调速设置为0

  attachInterrupt(0, ENC_READ, CHANGE);       //中断源0，触发编码器读取函数，电平变化触发
  attachInterrupt(1, ENC_READ, CHANGE);       //中断源1，触发编码器读取函数，电平变化触发

  EEPROM.get(0, offsets);                     //读取EEP里的校准数据
  if (offsets.ID == 35) 
    {
      calibrated = true;                      //如果读取到数据ID等于35，calibrated 为真（即有校准数据）
      Serial.println("Read calibration data!");
    }
  else 
    {
      calibrated = false;                     //没读到 calibrated 为假
      Serial.println("Has no calibration data!");
    }

  EEPROM.get(50, MyPid);                     //读取EEP里的PID数据
  if (MyPid.ID == 55)
    {
      PIDHas = true;                          //如果读取到数据ID等于35，calibrated 为真（即有校准数据）
      Serial.println("Read PID data!");
    }
  else
    {
      PIDHas = false;                         //没读到 calibrated 为假
      Serial.println("Has no PID data!");
    }
  delay(3000);                                //延时
  beep();                                     //蜂鸣器提示
  angle_setup();                              //
}

void loop() {

  currentT = millis();

  if (currentT - previousT_1 >= loop_time) {
    //Tuning();
    readControlParameters();  
    angle_calc();

    motor_speed = -enc_count;
    enc_count = 0;

    if (vertical && calibrated && !calibrating) {
      digitalWrite(BRAKE, HIGH);
      gyroX = GyX / 131.0; // Convert to deg/s

      gyroXfilt = alpha * gyroX + (1 - alpha) * gyroXfilt;

      motor_pos += motor_speed;
      motor_pos = constrain(motor_pos, -110, 110);
      
      int pwm = constrain(K1 * robot_angle + K2 * gyroXfilt + K3 * motor_speed + K4 * motor_pos, -255, 255); 
      //Serial.println(-pwm);
      Motor1_control(-pwm);

      // if ((speed_value - speed_remote) > SPEED_LIMIT)
      //   speed_value -= SPEED_LIMIT;
      // else if ((speed_value - speed_remote) < -SPEED_LIMIT)
      //   speed_value += SPEED_LIMIT;
      // else
      //   speed_value = speed_remote;  
      
      if ((steering_value - STEERING_CENTER - steering_remote) > ST_LIMIT)
        steering_value -= ST_LIMIT;
      else if ((steering_value - STEERING_CENTER - steering_remote) < -ST_LIMIT)
        steering_value += ST_LIMIT;
      else
        steering_value = STEERING_CENTER + steering_remote;

      steering_servo.write(steering_value);
      
      steering_servo2.write(STEERING_CENTER + speed_remote*7);
      
      //Motor2_control(speed_value);
    } else { 
      digitalWrite(BRAKE, LOW);
      steering_value = STEERING_CENTER;
      steering_servo.write(STEERING_CENTER);
      steering_servo2.write(STEERING_CENTER);
      speed_value = 0;
      Motor1_control(0);
      Motor2_control(0);
      motor_pos = 0;
    }
    previousT_1 = currentT;
  }
  
  if (currentT - previousT_2 >= 2000) {    
    battVoltage((double)analogRead(VBAT) / bat_divider); 
    if (!calibrated && !calibrating) {
      Serial.println("first you need to calibrate the balancing point...");
    }
    previousT_2 = currentT;
  }
}

