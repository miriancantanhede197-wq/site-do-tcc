const Alerts = {

    ultimoAviso: "",

    ultimoMomento: 0,

    intervalo:
        4000,


    podeFalar(mensagem) {

        const agora =
            Date.now();


        if (
            mensagem ===
            this.ultimoAviso
            &&
            agora -
            this.ultimoMomento
            <
            this.intervalo
        ) {

            return false;

        }


        this.ultimoAviso =
            mensagem;

        this.ultimoMomento =
            agora;


        return true;

    },


    falar(mensagem) {

        if (
            !this.podeFalar(mensagem)
        ) {

            return;

        }


        const elemento =
            document.getElementById(
                "lastAlert"
            );


        if (elemento) {

            elemento.textContent =
                mensagem;

        }


        Speech.falar(mensagem);

    }

};