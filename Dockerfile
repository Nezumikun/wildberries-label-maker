FROM node:18-alpine

# создание директории приложения
WORKDIR /home/node/app

RUN npm i -g supervisor
RUN npm i -g cross-env
RUN ln -snf /usr/share/zoneinfo/Europe/Moscow /etc/localtime
RUN echo 'Europe/Moscow' > /etc/timezone

# установка зависимостей
# символ астериск ("*") используется для того чтобы по возможности
# скопировать оба файла: package.json и package-lock.json
COPY package*.json ./

#RUN npm install
# Если вы создаете сборку для продакшн
RUN npm ci --omit=dev

# копируем исходный код
COPY . .

RUN rm ./package-lock.json

RUN mkdir files
RUN wget -O ./files/font.ttf https://github.com/google/fonts/raw/main/apache/roboto/static/Roboto-Medium.ttf

EXPOSE 3000
CMD [ "node", "./bin/www" ]