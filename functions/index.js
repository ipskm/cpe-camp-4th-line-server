const functions = require('firebase-functions');
const request = require('request-promise');

//add vision libralies
const admin = require('firebase-admin');
admin.initializeApp();

const region = 'asia-east2';
const runtimeOpts = {
  timeoutSeconds: 4,
  memory: "2GB"
};
// Imports the Google Cloud client libraries
const vision = require('@google-cloud/vision');
// Creates a client
const client = new vision.ImageAnnotatorClient();

//line header
const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message';
const LINE_HEADER = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer EsuoA3hG6K+c35X0r3ezNdsS4GSw4uBDCPE3gk7RwXIb7mmNAYrZKJCaFjVnqWb+egF5K9wLRJE4NIO84HPYhfiuWeFG1Yky48I8FviGlab/HNciJcgiMuJi3FtA/0iFxkbhwBdtEOGeioPqP5mhIgdB04t89/1O/w1cDnyilFU=`
};

exports.webhook = functions.region(region).runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
  let event = req.body.events[0]
  switch (event.type) {
    case 'message':
      if (event.message.type === 'image') {
        doImage(event);
      }
      if (event.message.type === 'text') {
        postToDialogflow(req);
      }
      break;
    case 'postback': {
      // [8.4]
      break;
    }
  }
  return res.status(200);
});

const postToDialogflow = req => {
  req.headers.host = "bots.dialogflow.com";
  return request.post({
    uri: "https://bots.dialogflow.com/line/4ab99b2f-3a13-4a28-94d1-beed1fbcbe63/webhook",
    headers: req.headers,
    body: JSON.stringify(req.body)
  });
};

const doImage = async (event) => {
  const path = require("path");
  const os = require("os");
  const fs = require("fs");

  // กำหนด URL ในการไปดึง binary จาก LINE กรณีผู้ใช้อัพโหลดภาพมาเอง
  let url = `${LINE_MESSAGING_API}/${event.message.id}/content`;

  // ตรวจสอบว่าภาพนั้นถูกส่งมจาก LIFF หรือไม่
  if (event.message.contentProvider.type === 'external') {
    // กำหนด URL รูปภาพที่ LIFF ส่งมา 
    url = event.message.contentProvider.originalContentUrl;
  }

  // ดาวน์โหลด binary
  let buffer = await request.get({
    headers: LINE_HEADER,
    uri: url,
    encoding: null // แก้ปัญหา binary ไม่สมบูรณ์จาก default encoding ที่เป็น utf-8
  });

  // สร้างไฟล์ temp ใน local จาก binary ที่ได้
  const tempLocalFile = path.join(os.tmpdir(), 'temp.jpg');
  await fs.writeFileSync(tempLocalFile, buffer);

  // กำหนดชื่อ bucket ใน Cloud Storage for Firebase
  const bucket = admin.storage().bucket('my-cloud-246402.appspot.com');

  // อัพโหลดไฟล์ขึ้น Cloud Storage for Firebase
  await bucket.upload(tempLocalFile, {
    destination: `${event.source.userId}.jpg`, // ให้ชื่อไฟล์เป็น userId ของ LINE
    metadata: {
      cacheControl: 'no-cache'
    }
  });

  /// ลบไฟล์ temp หลังจากอัพโหลดเสร็จ
  fs.unlinkSync(tempLocalFile)

  // ตอบกลับเพื่อ handle UX เนื่องจากทั้งดาวน์โหลดและอัพโหลดต้องใช้เวลา
  reply(event.replyToken, {
    type: 'text',
    text: 'บันทึกรูปเรียบร้อย'
  });
}

exports.landmarkDetection = functions.region(region).runWith(runtimeOpts)
  .storage.object()
  .onFinalize(async (object) => {
  const fileName = object.name // ดึงชื่อไฟล์มา
  const userId = fileName.split('.')[0] // แยกชื่อไฟล์ออกมา ซึ่งมันก็คือ userId

  // ทำนายโลโกที่อยู่ในภาพด้วย Cloud Vision API
  const [result] = await client.landmarkDetection(`gs://${object.bucket}/${fileName}`)
  const landmarks = result.landmarkAnnotations;
  
  // เอาผลลัพธ์มาเก็บใน array ซึ่งเป็นโครงสร้างของ Quick Reply
  let itemArray = []
  landmarks.forEach(landmark => {
    if (landmark.score >= 0.7) {
      itemArray.push({
        type: 'action',
        action: {
          type: 'postback',
          label: landmark.description,
          data: `team=${landmark.description}`,
          displayText: landmark.description
        }
      });
    }
  })
  
  // กำหนดตัวแปรมา 2 ตัว
  let msg = ''
  let quickItems = null
  
  // ตรวจสอบว่ามีผลลัพธ์การทำนายหรือไม่
  if (itemArray.length > 0) {
    msg = 'สถานที่นี้คือ'
    quickItems = { items: itemArray }
  } else {
    msg = 'ไม่รู้จักสถานที่นี้ โปรดลองใหม่อีกครั้ง'
    quickItems = null
  }
  
  // ส่งข้อความหาผู้ใช้ว่าพบโลโกหรือไม่ พร้อม Quick Reply(กรณีมีผลการทำนาย)
  push(userId, msg, quickItems)
})

const push = (userId, msg, quickItems) => {
  return request.post({
    headers: LINE_HEADER,
    uri: `${LINE_MESSAGING_API}/push`,
    body: JSON.stringify({
      to: userId,
      messages: [{
        type: "text",
        text: msg,
        quickReply: quickItems
      }]
    })
  })
}

// Reply Message
const reply = (token, payload) => {
  return request.post({
    uri: `${LINE_MESSAGING_API}/reply`,
    headers: LINE_HEADER,
    body: JSON.stringify({
      replyToken: token,
      messages: [payload]
    })
  })
}

// Broadcast Messages
const broadcast = (msg) => {
  return request.post({
    uri: `${LINE_MESSAGING_API}/broadcast`,
    headers: LINE_HEADER,
    body: JSON.stringify({
      messages: [{
        type: "text",
        text: msg
      }]
    })
  })
};