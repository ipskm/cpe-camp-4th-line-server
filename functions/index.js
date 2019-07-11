const functions = require('firebase-functions');
const request = require('request-promise');

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message';
const LINE_HEADER = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer EsuoA3hG6K+c35X0r3ezNdsS4GSw4uBDCPE3gk7RwXIb7mmNAYrZKJCaFjVnqWb+egF5K9wLRJE4NIO84HPYhfiuWeFG1Yky48I8FviGlab/HNciJcgiMuJi3FtA/0iFxkbhwBdtEOGeioPqP5mhIgdB04t89/1O/w1cDnyilFU=`
};

exports.webhook = functions.https.onRequest((req, res) => {
    if (req.method === "POST") {
      let event = req.body.events[0]
      if (event.type === "message" && event.message.type === "text") {
        postToDialogflow(req);
      } else {
        reply(req);
      }
    }
    return res.status(200).send(req.method);
  });
  
  const reply = req => {
    return request.post({
      uri: `${LINE_MESSAGING_API}/reply`,
      headers: LINE_HEADER,
      body: JSON.stringify({
        replyToken: req.body.events[0].replyToken,
        messages: [
          {
            type: "text",
            text: JSON.stringify(req.body)
          }
        ]
      })
    });
  };
  
  const postToDialogflow = req => {
    req.headers.host = "bots.dialogflow.com";
    return request.post({
      uri: "https://bots.dialogflow.com/line/4ab99b2f-3a13-4a28-94d1-beed1fbcbe63/webhook",
      headers: req.headers,
      body: JSON.stringify(req.body)
    });
  };