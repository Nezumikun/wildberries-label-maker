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

EXPOSE 3000
CMD [ "npm", "run", "dev:kube" ]