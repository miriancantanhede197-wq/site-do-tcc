const App = {

    ativo: false,


    async iniciar() {

        this.atualizarStatus(
            "Iniciando câmera..."
        );


        const cameraOK =
            await Camera.iniciar();


        if (!cameraOK) {

            this.atualizarStatus(
                "Não foi possível acessar a câmera."
            );

            return;

        }


        document
            .getElementById(
                "cameraStatus"
            )
            .textContent =
            "Ligada";


        this.atualizarStatus(
            "Carregando inteligência artificial..."
        );


        const iaOK =
            await Detector.carregar();


        if (!iaOK) {

            this.atualizarStatus(
                "Erro ao carregar IA."
            );

            Camera.parar();

            return;

        }


        document
            .getElementById(
                "aiStatus"
            )
            .textContent =
            "Ligada";


        this.ativo = true;


        Detector.iniciar();


        document
            .getElementById(
                "startButton"
            )
            .disabled =
            true;


        document
            .getElementById(
                "stopButton"
            )
            .disabled =
            false;


        document
            .getElementById(
                "cameraMessage"
            )
            .style.display =
            "none";


        this.atualizarStatus(
            "Sistema funcionando"
        );


        Speech.falar(
            "Sistema ativado."
        );

    },


    ativar() {

        if (!this.ativo) {

            this.iniciar();

            return;

        }


        Speech.falar(
            "O sistema já está ativado."
        );

    },


    desativar() {

        Detector.parar();

        Camera.parar();

        Speech.parar();


        this.ativo = false;


        document
            .getElementById(
                "startButton"
            )
            .disabled =
            false;


        document
            .getElementById(
                "stopButton"
            )
            .disabled =
            true;


        document
            .getElementById(
                "cameraStatus"
            )
            .textContent =
            "Desligada";


        document
            .getElementById(
                "aiStatus"
            )
            .textContent =
            "Desligada";


        document
            .getElementById(
                "cameraMessage"
            )
            .style.display =
            "flex";


        this.atualizarStatus(
            "Sistema desligado"
        );

    },


    atualizarStatus(texto) {

        document
            .getElementById(
                "status"
            )
            .textContent =
            texto;

    }

};


// BOTÃO INICIAR

document
    .getElementById(
        "startButton"
    )
    .addEventListener(
        "click",
        () => {

            App.iniciar();

        }
    );


// BOTÃO PARAR

document
    .getElementById(
        "stopButton"
    )
    .addEventListener(
        "click",
        () => {

            App.desativar();

        }
    );


// BOTÃO VOZ

document
    .getElementById(
        "voiceButton"
    )
    .addEventListener(
        "click",
        () => {

            Commands.iniciar();

        }
    );