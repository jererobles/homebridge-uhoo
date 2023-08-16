# homebridge-uhoo

Report sensor data from uHoo air quality monitor to HomeKit.


## Installation

`npm install homebridge-uhoo`


## Configuration

```json
{
    "accessory": "uHooAirQuality",
    "name": "Living Room Air Quality",
    "username": "YOUR_EMAIL",
    "password": "YOUR_PASSWORD",
    "clientId": "5059660210617291758|7900188431095154449"
}
```
Note: `clientId` might be user-specific, you can get this by sniffing your network traffic.


## Development

```bash
git clone https://github.com/jererobles/homebridge-uhoo.git
cd homebridge-uhoo
homebridge -D -U ~/dev/homebridge-uhoo
```
