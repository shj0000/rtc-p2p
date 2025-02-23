FROM node:alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ENV PATH /usr/src/app/node_modules/.bin:$PATH

COPY package*.json ./
RUN npm install

COPY . .

# Set the environment variable to use the legacy OpenSSL provider
ENV NODE_OPTIONS=--openssl-legacy-provider
ENV REACT_APP_SOCKET_SERVER_URL https://devrtc.m-teacher.co.kr:8080

RUN npm run build
RUN npm install -g serve -y

EXPOSE 5000
CMD [ "npx", "serve", "-s", "build" ]
