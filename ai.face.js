const FaceAI = {

    ativo: false,

    modelo: null,


    async carregar() {

        /*
         *
         * FUTURA IMPLEMENTAÇÃO
         *
         * Aqui será carregado o modelo
         * específico de reconhecimento facial.
         *
         */


        console.log(
            "Módulo facial preparado."
        );


        return true;

    },


    async detectar() {

        if (!this.ativo) {

            return [];

        }


        /*
         * Futuramente:
         *
         * 1. detectar rosto
         * 2. gerar representação facial
         * 3. comparar com pessoas cadastradas
         * 4. retornar nome
         */


        return [];

    }

};