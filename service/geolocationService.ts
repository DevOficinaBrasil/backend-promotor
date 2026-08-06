export default class GeolocationService 
{
    // Fila de requisições para respeitar o limite de 1 req/s do Nominatim
    private static nominatimQueue: Promise<void> = Promise.resolve();

    private cepClear(cep: string): string
    {
        return cep.replace(/\D/g, '');
    }

    private async getEnderecoViaCep(cep: string): Promise<any>
    {
        const cepLimpo = this.cepClear(cep);
        
        const url = `https://viacep.com.br/ws/${cepLimpo}/json/`;

        const result = await fetch(url);

        return result.json();
    }

    private async throttledNominatimFetch(url: string): Promise<any>
    {
        return new Promise((resolve, reject) => {
            GeolocationService.nominatimQueue = GeolocationService.nominatimQueue.then(async () => {
                try {
                    const result = await fetch(url, {
                        headers: { 'User-Agent': 'GeolocationService/1.0' }
                    });
                    const data = await result.json();
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
                // Aguarda 1s antes de liberar a próxima requisição
                await new Promise(r => setTimeout(r, 1000));
            });
        });
    }

    private async getLatLongByNominatim(cep: string): Promise<{ lat: number, long: number } | null>
    {
        const endereco = await this.getEnderecoViaCep(cep);

        if (!endereco || endereco.erro) {
            return null;
        }

        // Tentativa com endereço completo (incluindo bairro)
        const queryCompleta = encodeURIComponent(
            `${endereco.logradouro}, ${endereco.bairro}, ${endereco.localidade}, ${endereco.uf}`
        );
        const urlCompleta = `https://nominatim.openstreetmap.org/search?q=${queryCompleta}&format=json&limit=1`;

        const dataCompleta: any[] = await this.throttledNominatimFetch(urlCompleta);

        if (dataCompleta.length > 0) {
            return {
                lat: parseFloat(dataCompleta[0].lat),
                long: parseFloat(dataCompleta[0].lon)
            };
        }

        // Fallback: busca sem o bairro
        const querySemBairro = encodeURIComponent(
            `${endereco.logradouro}, ${endereco.localidade}, ${endereco.uf}`
        );

        const urlSemBairro = `https://nominatim.openstreetmap.org/search?q=${querySemBairro}&format=json&limit=1`;

        const dataSemBairro: any[] = await this.throttledNominatimFetch(urlSemBairro);

        if (dataSemBairro.length > 0) {
            return {
                lat: parseFloat(dataSemBairro[0].lat),
                long: parseFloat(dataSemBairro[0].lon)
            };
        }

        return null;
    }

    private async getLatLongByGoogleMaps(cep: string): Promise<{ lat: number, long: number } | null>
    {
        const apiKey = process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            console.warn('GOOGLE_API_KEY não configurada, fallback do Google Maps indisponível');
            return null;
        }

        const cleanCep = this.cepClear(cep);

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${cleanCep}&key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Erro na API Google Geocoding (${response.status})`);
            return null;
        }

        const data: any = await response.json();

        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
            return null;
        }

        const location = data.results[0].geometry.location;

        return {
            lat: location.lat,
            long: location.lng
        };
    }

    public async getLatLongByCep(cep: string): Promise<{ lat: number, long: number } | null>
    {
        try {
            const nominatimResult = await this.getLatLongByNominatim(cep);
            if (nominatimResult) return nominatimResult;
        } 
        catch (err) {
            console.error('Nominatim falhou, tentando Google Maps:', err);
        }

        try {
            return await this.getLatLongByGoogleMaps(cep);
        } 
        catch (err) {
            console.error('Google Maps falhou:', err);
            return null;
        }
    }
}
