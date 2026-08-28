const Speech = {

    falando: false,


    falar(texto) {

        if (!("speechSynthesis" in window)) {

            console.log(
                "Síntese de voz não disponível."
            );

            return;

        }


        window.speechSynthesis.cancel();


        const fala =
            new SpeechSynthesisUtterance(texto);


        fala.lang = "pt-BR";

        fala.rate = 1;

        fala.pitch = 1;

        fala.volume = 1;


        fala.onstart = () => {

            this.falando = true;

        };


        fala.onend = () => {

            this.falando = false;

        };


        window.speechSynthesis.speak(fala);

    },


    parar() {

        if ("speechSynthesis" in window) {

            window.speechSynthesis.cancel();

        }

    }

};