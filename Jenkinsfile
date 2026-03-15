pipeline {
    agent any

    environment {
        DOCKER_IMAGE = 'document-service'
        DOCKER_REGISTRY = 'harbor.local'
    }

    stages {
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }
        
        stage('Test unitaires (Jest)') {
            steps {
                sh 'npm run test:cov' // for coverage > 80%
            }
        }
        
        stage('Build Image Docker multi-stage') {
            steps {
                sh "docker build -t ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${env.BUILD_NUMBER} ."
            }
        }
        
        stage('Push Harbor On-Premise') {
            steps {
                sh "docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${env.BUILD_NUMBER}"
            }
        }
        
        stage('Deploy STAGING (auto)') {
            steps {
                echo 'Deploying to staging...'
                sh "kubectl apply -f k8s/deploy-staging.yaml"
            }
        }
        
        stage('Tests E2E (Playwright)') {
            steps {
                echo 'Running E2E tests...'
                sh 'npm run test:e2e'
            }
        }
        
        stage('Playwright - Deploy PROD [Manuel]') {
            steps {
                input message: "Deploy to production?", ok: "Yes"
                echo 'Deploying to PROD...'
                sh "kubectl apply -f k8s/deploy-prod.yaml"
            }
        }
    }
}
