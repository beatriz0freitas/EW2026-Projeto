FROM node:22

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 16020

CMD ["npm", "start"]

