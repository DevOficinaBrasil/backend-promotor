FROM node:20-alpine 

WORKDIR /APP

# Instalar curl no Alpine
RUN apk add --no-cache \
    curl \
    imagemagick \
    ghostscript

# Baixar o certificado público da AWS (global-bundle.pem)
RUN curl -s https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    -o /APP/global-bundle.pem

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3008

CMD ["npm", "run", "start"]